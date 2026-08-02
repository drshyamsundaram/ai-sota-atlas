"""
Scheduled refresh job.

Reruns the scraper + pandas processing on a configurable interval and pushes
the aggregated dataset into the running dashboard via /api/public/ingest.

Usage
-----
    # every 6 hours, pushing to a deployed dashboard
    python pipeline/scheduler.py --interval-minutes 360 \
        --dashboard-url https://your-app.lovable.app

    # one pass then exit (useful for external cron / CI)
    python pipeline/scheduler.py --once

Environment overrides: REFRESH_INTERVAL_MINUTES, DASHBOARD_URL, CRON_SECRET.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

from process import cap_per_category, clean, standardize_columns, to_records  # type: ignore
from scraper import iter_targets, now_iso, RobotsGate, scrape_source  # type: ignore

import pandas as pd

MAX_PUSH_RETRIES = 4
BASE_BACKOFF_S = 2.0
JITTER_FRACTION = 0.1  # +/-10% jitter so runs never align exactly


async def collect(config: dict) -> list[dict]:
    robots = RobotsGate()
    sem = asyncio.Semaphore(4)
    targets = list(iter_targets(config))
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *(scrape_source(client, robots, sem, url, cat) for url, cat in targets)
        )
    failures = [r for r in results if not r.ok]
    if failures:
        print(f"  {len(failures)} source(s) failed this run", file=sys.stderr)
    return [rec.model_dump() for res in results for rec in res.records]


def process(raw: list[dict], max_items: int) -> list[dict]:
    df = pd.DataFrame(raw)
    if df.empty:
        return []
    return to_records(cap_per_category(clean(standardize_columns(df)), max_items))


async def push(dashboard_url: str, payload: dict, secret: str | None) -> None:
    url = dashboard_url.rstrip("/") + "/api/public/ingest"
    headers = {"content-type": "application/json"}
    if secret:
        headers["x-cron-secret"] = secret
    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt in range(MAX_PUSH_RETRIES):
            try:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                print(f"  pushed -> {url}: {resp.text[:200]}")
                return
            except httpx.HTTPError as exc:
                backoff = BASE_BACKOFF_S * (2**attempt) + random.uniform(0, 1)
                print(f"  push retry {attempt + 1} in {backoff:.1f}s :: {exc}", file=sys.stderr)
                await asyncio.sleep(backoff)
    print("  push failed after retries", file=sys.stderr)


async def run_once(args: argparse.Namespace) -> None:
    started = datetime.now(timezone.utc)
    print(f"[{started:%Y-%m-%d %H:%M:%SZ}] refresh started")
    config = json.loads(Path(args.config).read_text())
    max_items = int(config["llm_status_spec"].get("max_items_per_category", 5))

    raw = await collect(config)
    records = process(raw, max_items)
    payload = {
        "generated_at": now_iso(),
        "record_count": len(records),
        "records": records,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"  wrote {len(records)} records -> {out}")

    if records and args.dashboard_url:
        await push(args.dashboard_url, payload, args.secret)
    elif not records:
        print("  no records produced; skipping push", file=sys.stderr)


async def loop(args: argparse.Namespace) -> None:
    while True:
        try:
            await run_once(args)
        except Exception as exc:  # noqa: BLE001 - a failed run must not kill the schedule
            print(f"  run failed: {exc}", file=sys.stderr)
        base = args.interval_minutes * 60
        sleep_s = base * (1 + random.uniform(-JITTER_FRACTION, JITTER_FRACTION))
        print(f"  next refresh in {sleep_s / 60:.1f} min\n")
        await asyncio.sleep(sleep_s)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scheduled leaderboard refresh")
    parser.add_argument("--config", default="pipeline/config.json")
    parser.add_argument("--out", default="src/data/records.json")
    parser.add_argument(
        "--interval-minutes",
        type=float,
        default=float(os.environ.get("REFRESH_INTERVAL_MINUTES", 360)),
    )
    parser.add_argument("--dashboard-url", default=os.environ.get("DASHBOARD_URL", ""))
    parser.add_argument("--secret", default=os.environ.get("CRON_SECRET"))
    parser.add_argument("--once", action="store_true", help="run a single pass and exit")
    args = parser.parse_args()

    asyncio.run(run_once(args) if args.once else loop(args))


if __name__ == "__main__":
    main()
