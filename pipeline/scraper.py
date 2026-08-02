"""
Async SOTA-shift leaderboard scraper.

Features
--------
* robots.txt aware (per-host cache, honours Disallow + Crawl-delay)
* randomized politeness delay between 1-5 seconds
* rotating User-Agent pool
* Pydantic extraction schema -> normalized JSON records
* exponential backoff with jitter on transient failures

Usage
-----
    python -m pip install -r pipeline/requirements.txt
    python pipeline/scraper.py --config pipeline/config.json --out pipeline/out/raw_records.json
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import random
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Literal
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, field_validator

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "sota-shift-tracker/1.0 (+https://example.org/bot; research crawler)",
]

MIN_DELAY_S = 1.0
MAX_DELAY_S = 5.0
MAX_RETRIES = 5
BASE_BACKOFF_S = 1.5
REQUEST_TIMEOUT_S = 30.0
MAX_CONCURRENCY = 4

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}

METRIC_ALIASES = {
    "intelligence": ("intelligence", "score"),
    "arena score": ("arena_elo", "elo"),
    "elo": ("arena_elo", "elo"),
    "score": ("score", "score"),
    "accuracy": ("accuracy", "percent"),
    "hallucination rate": ("hallucination_rate", "percent"),
    "factual consistency": ("factual_consistency", "percent"),
    "faithfulness": ("faithfulness", "score"),
    "groundedness": ("groundedness", "score"),
    "citation accuracy": ("citation_accuracy", "percent"),
    "tokens/s": ("throughput", "tokens_per_second"),
    "latency": ("latency", "seconds"),
    "price": ("price", "usd_per_mtok"),
}

VERSION_RE = re.compile(r"\b(v?\d+(?:\.\d+)*(?:-[a-z0-9]+)?)\b", re.IGNORECASE)


# --------------------------------------------------------------------------- #
# Extraction schema (normalized results form)
# --------------------------------------------------------------------------- #


class LeaderboardRecord(BaseModel):
    """One normalized measurement of one model on one benchmark."""

    source_name: str
    source_url: str
    retrieved_at: str
    category: str
    model_name: str
    model_version: str | None = None
    benchmark_name: str
    metric_name: str
    metric_value: float | None = None
    metric_unit: str = "score"
    rank: int | None = None
    date_reported: str | None = None
    scope_region: Literal[
        "global", "india", "china", "europe", "us", "unknown"
    ] = "unknown"
    task_type: str = "general"
    raw_hash: str = Field(default="")

    @field_validator("model_name")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("model_name must not be empty")
        return v

    def with_hash(self) -> "LeaderboardRecord":
        payload = "|".join(
            [
                self.source_url,
                self.model_name,
                self.model_version or "",
                self.benchmark_name,
                self.metric_name,
                str(self.metric_value),
                str(self.rank),
            ]
        )
        self.raw_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
        return self


class ScrapeResult(BaseModel):
    source_url: str
    category: str
    ok: bool
    reason: str | None = None
    records: list[LeaderboardRecord] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def source_name_from_url(url: str) -> str:
    host = urlparse(url).netloc.replace("www.", "")
    return re.sub(r"[^a-z0-9]+", "_", host.lower()).strip("_")


def region_for_category(category: str) -> str:
    return {
        "india": "india",
        
        "china": "china",
        "europe": "europe",
    }.get(category, "global")


def parse_number(text: str) -> float | None:
    cleaned = text.strip().replace(",", "").replace("%", "").replace("$", "")
    m = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    return float(m.group()) if m else None


def split_model_version(text: str) -> tuple[str, str | None]:
    text = " ".join(text.split())
    m = VERSION_RE.search(text)
    if not m:
        return text, None
    version = m.group(1).lstrip("vV")
    name = (text[: m.start()] + text[m.end() :]).strip(" -–—")
    return (name or text), version


def normalize_metric(header: str) -> tuple[str, str]:
    key = header.strip().lower()
    for alias, value in METRIC_ALIASES.items():
        if alias in key:
            return value
    return re.sub(r"[^a-z0-9]+", "_", key).strip("_") or "score", "score"


# --------------------------------------------------------------------------- #
# robots.txt gate
# --------------------------------------------------------------------------- #


class RobotsGate:
    def __init__(self) -> None:
        self._cache: dict[str, RobotFileParser | None] = {}
        self._lock = asyncio.Lock()

    async def _load(self, client: httpx.AsyncClient, origin: str) -> RobotFileParser | None:
        parser = RobotFileParser()
        try:
            resp = await client.get(f"{origin}/robots.txt", timeout=10.0)
            if resp.status_code >= 400:
                parser.parse([])
            else:
                parser.parse(resp.text.splitlines())
        except httpx.HTTPError:
            return None
        return parser

    async def allowed(self, client: httpx.AsyncClient, url: str, agent: str) -> tuple[bool, float]:
        parts = urlparse(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        async with self._lock:
            if origin not in self._cache:
                self._cache[origin] = await self._load(client, origin)
        parser = self._cache[origin]
        if parser is None:
            # Unknown robots.txt -> be conservative but do not hard-block.
            return True, 0.0
        crawl_delay = parser.crawl_delay(agent) or parser.crawl_delay("*") or 0
        return parser.can_fetch(agent, url), float(crawl_delay)


# --------------------------------------------------------------------------- #
# Fetching with exponential backoff
# --------------------------------------------------------------------------- #


async def polite_delay(extra: float = 0.0) -> None:
    await asyncio.sleep(random.uniform(MIN_DELAY_S, MAX_DELAY_S) + extra)


async def fetch(client: httpx.AsyncClient, url: str, robots: RobotsGate) -> str:
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        agent = random.choice(USER_AGENTS)
        allowed, crawl_delay = await robots.allowed(client, url, agent)
        if not allowed:
            raise PermissionError(f"blocked by robots.txt: {url}")
        await polite_delay(crawl_delay)
        try:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": agent,
                    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                follow_redirects=True,
                timeout=REQUEST_TIMEOUT_S,
            )
            if resp.status_code in RETRYABLE_STATUS:
                raise httpx.HTTPStatusError(
                    f"retryable status {resp.status_code}", request=resp.request, response=resp
                )
            resp.raise_for_status()
            return resp.text
        except (httpx.HTTPError, httpx.TimeoutException) as exc:  # transient
            last_error = exc
            backoff = BASE_BACKOFF_S * (2**attempt) + random.uniform(0, 1)
            print(f"  retry {attempt + 1}/{MAX_RETRIES} in {backoff:.1f}s :: {url} :: {exc}", file=sys.stderr)
            await asyncio.sleep(backoff)
    raise RuntimeError(f"exhausted retries for {url}: {last_error}")


# --------------------------------------------------------------------------- #
# Table extraction
# --------------------------------------------------------------------------- #


def extract_records(html: str, url: str, category: str) -> list[LeaderboardRecord]:
    soup = BeautifulSoup(html, "lxml")
    retrieved_at = now_iso()
    source_name = source_name_from_url(url)
    benchmark_default = (soup.title.get_text(strip=True) if soup.title else source_name)[:120]
    records: list[LeaderboardRecord] = []

    for table in soup.find_all("table"):
        headers = [th.get_text(" ", strip=True) for th in table.find_all("th")]
        if not headers:
            continue
        model_col = next(
            (i for i, h in enumerate(headers) if re.search(r"model|system|name", h, re.I)), 0
        )
        rank_col = next((i for i, h in enumerate(headers) if re.search(r"rank|#", h, re.I)), None)

        for row_idx, row in enumerate(table.find_all("tr")):
            cells = [td.get_text(" ", strip=True) for td in row.find_all("td")]
            if len(cells) <= model_col:
                continue
            model_name, model_version = split_model_version(cells[model_col])
            if not model_name:
                continue
            rank = None
            if rank_col is not None and rank_col < len(cells):
                parsed = parse_number(cells[rank_col])
                rank = int(parsed) if parsed is not None else None
            rank = rank if rank is not None else row_idx + 1

            for col_idx, cell in enumerate(cells):
                if col_idx in {model_col, rank_col}:
                    continue
                if col_idx >= len(headers):
                    continue
                value = parse_number(cell)
                if value is None:
                    continue
                metric_name, metric_unit = normalize_metric(headers[col_idx])
                records.append(
                    LeaderboardRecord(
                        source_name=source_name,
                        source_url=url,
                        retrieved_at=retrieved_at,
                        category=category,
                        model_name=model_name,
                        model_version=model_version,
                        benchmark_name=benchmark_default,
                        metric_name=metric_name,
                        metric_value=value,
                        metric_unit="percent" if "%" in cell else metric_unit,
                        rank=rank,
                        date_reported=retrieved_at[:10],
                        scope_region=region_for_category(category),
                        task_type="hallucination"
                        if category == "hallucination_safety"
                        else "general",
                    ).with_hash()
                )
    return records


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #


async def scrape_source(
    client: httpx.AsyncClient,
    robots: RobotsGate,
    sem: asyncio.Semaphore,
    url: str,
    category: str,
) -> ScrapeResult:
    async with sem:
        try:
            html = await fetch(client, url, robots)
        except PermissionError as exc:
            return ScrapeResult(source_url=url, category=category, ok=False, reason=str(exc))
        except Exception as exc:  # noqa: BLE001 - report and continue
            return ScrapeResult(source_url=url, category=category, ok=False, reason=str(exc))
        try:
            records = extract_records(html, url, category)
        except Exception as exc:  # noqa: BLE001
            return ScrapeResult(
                source_url=url, category=category, ok=False, reason=f"parse error: {exc}"
            )
        return ScrapeResult(source_url=url, category=category, ok=True, records=records)


def iter_targets(config: dict[str, Any]) -> Iterable[tuple[str, str]]:
    for category in config["llm_status_spec"]["categories"]:
        for url in category.get("sources", []):
            yield url, category["id"]


async def run(config_path: Path, out_path: Path) -> None:
    config = json.loads(config_path.read_text())
    targets = list(iter_targets(config))
    robots = RobotsGate()
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    async with httpx.AsyncClient(http2=False) as client:
        results = await asyncio.gather(
            *(scrape_source(client, robots, sem, url, cat) for url, cat in targets)
        )

    records = [r.model_dump() for res in results for r in res.records]
    failures = [
        {"source_url": r.source_url, "category": r.category, "reason": r.reason}
        for r in results
        if not r.ok
    ]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(
            {"generated_at": now_iso(), "records": records, "failures": failures},
            indent=2,
            ensure_ascii=False,
        )
    )
    print(f"wrote {len(records)} records ({len(failures)} source failures) -> {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="SOTA leaderboard scraper")
    parser.add_argument("--config", default="pipeline/config.json", type=Path)
    parser.add_argument("--out", default="pipeline/out/raw_records.json", type=Path)
    args = parser.parse_args()
    asyncio.run(run(args.config, args.out))


if __name__ == "__main__":
    main()
