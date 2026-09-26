# AI SOTA Shift Tracker

Tracks state-of-the-art (SOTA) shifts across public LLM leaderboards, token-utilisation rankings and an LLM & Tokenomics knowledge graph.

**Live app:** https://ai-sota-atlas.lovable.app · **Docs in the app:** `/docs` · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Created by [Dr Shyam Sundaram](https://www.linkedin.com/in/bioenable/).

---

## 1. What the dashboard does

| Section | Route | Purpose |
| --- | --- | --- |
| Leaderboard dashboard | `/` | Normalized benchmark results per category, filters, charts, details table, batch status, Refresh now / Auto-refresh |
| Token utilisation report | `/tokens` | KPI band, data-quality panel, charts, country drill-down, granular table, CSV export |
| LLM & Tokenomics KG | `/knowledge-graph` | Interactive graph of models, developers, countries, benchmarks, categories and token slices |
| API docs | `/api-docs` | Public REST endpoints (OpenAPI JSON at `/api/public/docs`) |
| Documentation | `/docs` | This README and the technical architecture, rendered in the UI |

### Categories
- **Global frontier** — BenchLM, Aider, Humanity's Last Exam, Berkeley function-calling, SWE-bench, ARC Prize, Vectara
- **Hallucination & safety** — Suprmind, Vectara (hallucination_rate, factual_consistency, faithfulness, groundedness, citation_accuracy)
- **Cybersecurity** — Nilgiri cyber range (SPARC Labs), BenchLM cybersecurity, Cybench, Stanford HELM
- **India, China, Europe** — regional benchmarks and model families

Sources are defined in `pipeline/config.json`. Pages that draw their tables in the browser, or publish no table, are kept as reference-only — scores are never invented.

## 2. Using the dashboard

- **Refresh now** runs the server-side collector for every source (leaderboards + token data), stores a new batch and reloads charts, tables and the knowledge graph.
- **Auto-refresh** re-reads the latest stored batch at 1m / 5m / 15m / 1h / 6h.
- **Leaderboard filters**: category, metric, region, search.
- **Import JSON** previews a normalized records file client-side.
- **Token report**: pick a slice (Overall / Programming / Language), a country or developer, drill down, export CSV.
- **Knowledge graph**: filter node types, country, category, slice, top-N; search; click a node for connections, scores and token KPIs; export PNG/JSON. Auto-updates every ~60s, on tab focus and after every refresh.

## 3. Data model

Normalized leaderboard record:

```json
{
  "source_name": "artificial_analysis",
  "source_url": "https://artificialanalysis.ai/leaderboards/models",
  "retrieved_at": "2026-08-02T10:30:00Z",
  "category": "global_frontier",
  "model_name": "Claude Opus",
  "model_version": "4.8",
  "benchmark_name": "AA Leaderboard",
  "metric_name": "intelligence",
  "metric_value": 57.9,
  "metric_unit": "score",
  "rank": 1,
  "date_reported": "2026-07-23",
  "scope_region": "global",
  "task_type": "general",
  "raw_hash": "..."
}
```

Token records carry slice, model, developer, country (developer home country), weekly tokens, share and week-over-week growth. KPIs are defined in `pipeline/token_config.json`.

## 4. REST API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/public/dataset` | Latest leaderboard dataset |
| POST | `/api/public/scrape` | Run collector now (leaderboards + tokens) |
| POST | `/api/public/ingest` | Push a normalized dataset (from the Python pipeline) |
| GET | `/api/public/tokens` | Token records; `slice`, `country`, `developer`, `model`, `group_by`, `format=csv`, `limit` |
| POST | `/api/public/tokens/refresh` | Re-collect token data only |
| GET | `/api/public/graph` | Knowledge graph; `mini`, `types` |
| GET | `/api/public/docs` | OpenAPI 3 spec |

## 5. Offline Python pipeline

```bash
python -m pip install -r pipeline/requirements.txt
python pipeline/scraper.py --config pipeline/config.json --out pipeline/out/raw_records.json
python pipeline/process.py --in pipeline/out/raw_records.json --out src/data/records.json
python pipeline/scheduler.py --once --dashboard-url https://ai-sota-atlas.lovable.app
```

Async, robots.txt-aware, randomized 1–5 s delays, rotating User-Agents, Pydantic extraction schema, exponential backoff; pandas cleaning, snake_case columns, dedup, per-category caps. See `pipeline/README.md`.

## 6. Known limitations

- Token numbers cover only OpenRouter traffic; under-represents vendors with strong direct APIs.
- Country values are attributed from the developer's home country.
- Per-language slices come from a top-10-only feed.
- Model names differ across sources, so only part of the models are matched in the knowledge graph (shown on the page).
- Some benchmark sites render tables client-side and yield no scores yet.

## 7. Development

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Built with [Lovable](https://lovable.dev) — changes sync two-way with GitHub.
