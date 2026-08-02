# SOTA shift pipeline

Two stages feed the dashboard.

```bash
python -m pip install -r pipeline/requirements.txt

# 1. async, robots-aware scrape of every source in config.json
python pipeline/scraper.py --config pipeline/config.json --out pipeline/out/raw_records.json

# 2. pandas cleaning + aggregation, exported straight into the dashboard
python pipeline/process.py --in pipeline/out/raw_records.json --out src/data/records.json
```

Scraper guarantees: robots.txt respected per host (including `Crawl-delay`),
randomized 1–5s delays, rotating User-Agent pool, Pydantic `LeaderboardRecord`
extraction schema, and exponential backoff with jitter on 408/429/5xx/timeouts.

## Pushing into a running dashboard

The dashboard also accepts the same payload over HTTP:

```bash
curl -X POST https://<your-app>/api/public/ingest \
  -H 'content-type: application/json' \
  --data @src/data/records.json
```

The endpoint validates every row against the normalized schema and returns
accepted/rejected counts. The dashboard's **Import JSON** button loads the same
file client-side for instant preview.
