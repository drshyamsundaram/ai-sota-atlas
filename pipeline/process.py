"""
Pandas post-processing for scraped leaderboard records.

* standardizes column names to snake_case
* cleans whitespace / casing / numeric types
* de-duplicates on raw_hash and on (source, model, benchmark, metric)
* caps rows per category with `max_items_per_category`
* exports the aggregated dataset for the dashboard

Usage
-----
    python pipeline/process.py \
        --config pipeline/config.json \
        --in pipeline/out/raw_records.json \
        --out src/data/records.json \
        --csv pipeline/out/aggregated.csv
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pandas as pd

REPORT_COLUMNS = [
    "source_name",
    "source_url",
    "retrieved_at",
    "category",
    "model_name",
    "model_version",
    "benchmark_name",
    "metric_name",
    "metric_value",
    "metric_unit",
    "rank",
    "date_reported",
    "scope_region",
    "task_type",
    "raw_hash",
]

COLUMN_SYNONYMS = {
    "model": "model_name",
    "name": "model_name",
    "version": "model_version",
    "benchmark": "benchmark_name",
    "metric": "metric_name",
    "value": "metric_value",
    "score": "metric_value",
    "unit": "metric_unit",
    "position": "rank",
    "region": "scope_region",
    "date": "date_reported",
    "url": "source_url",
    "source": "source_name",
}


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    def snake(name: str) -> str:
        name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", str(name))
        name = re.sub(r"[^0-9a-zA-Z]+", "_", name)
        return name.strip("_").lower()

    df = df.rename(columns={c: snake(c) for c in df.columns})
    df = df.rename(columns={k: v for k, v in COLUMN_SYNONYMS.items() if k in df.columns})
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    for col in REPORT_COLUMNS:
        if col not in df.columns:
            df[col] = pd.NA

    text_cols = [
        "source_name",
        "source_url",
        "category",
        "model_name",
        "model_version",
        "benchmark_name",
        "metric_name",
        "metric_unit",
        "scope_region",
        "task_type",
        "raw_hash",
    ]
    for col in text_cols:
        df[col] = (
            df[col].astype("string").str.replace(r"\s+", " ", regex=True).str.strip()
        )

    df["model_name"] = df["model_name"].str.title().str.replace(r"\bGpt\b", "GPT", regex=True)
    df["metric_name"] = df["metric_name"].str.lower().str.replace(" ", "_", regex=False)
    df["scope_region"] = df["scope_region"].fillna("unknown").str.lower()
    df["metric_value"] = pd.to_numeric(df["metric_value"], errors="coerce")
    df["rank"] = pd.to_numeric(df["rank"], errors="coerce").astype("Int64")
    df["date_reported"] = pd.to_datetime(df["date_reported"], errors="coerce", utc=True)
    df["retrieved_at"] = pd.to_datetime(df["retrieved_at"], errors="coerce", utc=True)

    df = df.dropna(subset=["model_name", "metric_value"])
    df = df.drop_duplicates(subset=["raw_hash"])
    df = df.drop_duplicates(
        subset=["source_name", "model_name", "model_version", "benchmark_name", "metric_name"],
        keep="last",
    )
    return df


def cap_per_category(df: pd.DataFrame, max_items: int) -> pd.DataFrame:
    df = df.sort_values(["category", "rank", "metric_value"], ascending=[True, True, False])
    return (
        df.groupby(["category", "benchmark_name", "metric_name"], dropna=False, group_keys=False)
        .head(max_items)
        .reset_index(drop=True)
    )


def to_records(df: pd.DataFrame) -> list[dict]:
    out = df.copy()
    out["date_reported"] = out["date_reported"].dt.strftime("%Y-%m-%d")
    out["retrieved_at"] = out["retrieved_at"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    out = out[REPORT_COLUMNS].where(pd.notna(out[REPORT_COLUMNS]), None)
    return json.loads(out.to_json(orient="records"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean and aggregate scraped records")
    parser.add_argument("--config", default="pipeline/config.json", type=Path)
    parser.add_argument("--in", dest="inp", default="pipeline/out/raw_records.json", type=Path)
    parser.add_argument("--out", default="src/data/records.json", type=Path)
    parser.add_argument("--csv", default="pipeline/out/aggregated.csv", type=Path)
    args = parser.parse_args()

    config = json.loads(args.config.read_text())
    max_items = int(config["llm_status_spec"].get("max_items_per_category", 5))

    payload = json.loads(args.inp.read_text())
    raw = payload["records"] if isinstance(payload, dict) else payload
    df = pd.DataFrame(raw)
    if df.empty:
        raise SystemExit("no records to process")

    df = cap_per_category(clean(standardize_columns(df)), max_items)
    records = to_records(df)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(
            {
                "generated_at": pd.Timestamp.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "record_count": len(records),
                "records": records,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    args.csv.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.csv, index=False)
    print(f"exported {len(records)} rows -> {args.out} and {args.csv}")


if __name__ == "__main__":
    main()
