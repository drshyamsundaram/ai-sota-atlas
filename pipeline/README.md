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

## Scheduled refresh

`pipeline/scheduler.py` reruns the scrape + pandas stages on a configurable
interval (with ±10% jitter so runs never align exactly), writes
`src/data/records.json`, and pushes the dataset to the dashboard.

```bash
# every 6 hours (default), pushing into a running dashboard
DASHBOARD_URL=https://your-app.lovable.app \
REFRESH_INTERVAL_MINUTES=360 \
python pipeline/scheduler.py

# single pass — use this shape from system cron, GitHub Actions, or any scheduler
python pipeline/scheduler.py --once --interval-minutes 60 \
  --dashboard-url https://your-app.lovable.app
```

Crontab example (hourly):

```
0 * * * * cd /path/to/repo && DASHBOARD_URL=https://your-app.lovable.app \
  python pipeline/scheduler.py --once >> /var/log/sota-refresh.log 2>&1
```

The dashboard side polls `GET /api/public/dataset` at the interval chosen in
the **Auto-refresh** dropdown (off / 1m / 5m / 15m / 1h / 6h) and swaps in the
new dataset as soon as `generated_at` changes. The server keeps the latest
ingested dataset in memory, so a redeploy falls back to the bundled seed file
until the next scheduled push.
