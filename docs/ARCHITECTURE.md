# Technical architecture

## Overview

```text
                +-------------------------------+
  Browser  ---> | TanStack Start (React 19, SSR)|
                |  /  /tokens  /knowledge-graph |
                |  /api-docs  /docs (4 tabs)    |
                +---------------+---------------+
                                |
                   server routes /api/public/*
                                |
     +--------------------------+--------------------------+
     |                          |                          |
 collector.server.ts   token-collector.server.ts     graph.ts (pure)
 (leaderboards)        (OpenRouter rankings)         buildGraph / miniGraph
     |                          |                          ^
     v                          v                          |
 leaderboard_datasets     token_datasets  --------> read by hooks + /api/public/graph
        (Lovable Cloud database, durable batches)

 Offline: pipeline/scraper.py -> process.py -> scheduler.py -> POST /api/public/ingest
```

## Stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start v1, React 19, Vite 8, edge (Worker) runtime |
| Styling | Tailwind CSS v4, semantic tokens in `src/styles.css`, dark instrument-panel theme |
| Data fetching | TanStack Query (polling, invalidation after refresh) |
| Tables / charts | TanStack Table, Recharts (`var(--chart-1..5)`) |
| Graph | `react-force-graph-2d`, lazy-loaded behind `ClientOnly` |
| Validation | Zod (`src/lib/schema.ts`, `src/lib/token-schema.ts`) |
| Storage | Lovable Cloud database tables `leaderboard_datasets`, `token_datasets` |
| Offline pipeline | Python: httpx, BeautifulSoup/lxml, Pydantic, pandas |

## Key modules

| Path | Responsibility |
| --- | --- |
| `pipeline/config.json` | Leaderboard categories, sources, metrics, rules |
| `pipeline/token_config.json` | Token slices, KPIs, developer→country map |
| `src/lib/collector.server.ts` | robots.txt checks, rotating UA, random delays, backoff, HTML table extraction, Nilgiri JSON extractor, fallback to previous records |
| `src/lib/token-collector.server.ts` | Parses OpenRouter ranking feeds, growth calculation, country attribution |
| `src/lib/dataset-store.ts`, `token-store.ts` | Read/write latest batches |
| `src/lib/graph.ts` | Pure knowledge-graph builder shared by UI and API |
| `src/hooks/use-kg-data.ts` | Graph data queries (60s poll, refetch on focus) |
| `src/lib/collector.server.ts` extractors | `extractNilgiri` (results.json), `extractLiveCodeBench` (performances JSON, 12-month Pass@1), SWE-bench embedded data, modelgrep AA indices, `extractLmArena` (HF datasets-server rows, overall split), `extractHelm` (HELM Capabilities release JSON, Accuracy table), `extractMmmu` (leaderboard_data.json), `extractMlperf` (newest MLCommons summary_results.json, closed datacenter offline tokens/s) |
| `src/components/SourcesPanel.tsx` | Per-source row counts on token report and KG |
| `src/lib/ontology.ts`, `ontology/*.ttl` | TTL ontologies per section + live metrics on /docs |
| `src/routes/api/public/*` | dataset, scrape, ingest, tokens, tokens/refresh, graph, docs |
| `src/data/hardware.json`, `hardware.ts` | Curated source-linked accelerator specs, server configurations, model disclosures and references |
| `src/lib/hardware-schema.ts`, `hardware-sizing.ts` | Browser-safe record types, workload memory calculations and CSV escaping |
| `src/lib/hardware-collector.server.ts` | Bounded fetch/retries for published MLPerf inference JSON; preserves system context |
| `src/lib/hardware.functions.ts` | Public read-only server function and shared query options for `/hardware` |
| `src/components/hardware/*`, `src/routes/hardware.tsx` | Catalogue comparisons, workload sizing and live measured system results |

## Refresh flow

1. User clicks **Refresh now** → `POST /api/public/scrape`.
2. Collector fetches up to 16 sources per category politely (robots.txt, 1–5 s jitter, backoff on 408/429/5xx).
3. Rows are validated with Zod; failed sources keep their previous rows.
4. Token collector runs in the same request.
5. New batch stored; client invalidates dataset, token and KG queries.

## Knowledge graph

Nodes: model, developer, country, benchmark, category, slice, accelerator, server and hardware_vendor. Edges add manufactures, contains, trained_on, finetuned_on, served_on and benchmarked_on; estimated_suitable_for is reserved for explicitly labelled planning estimates, not automatically asserted by the catalogue. Model names are normalized (vendor prefixes, "by x", parentheticals stripped) to merge leaderboard and token entities; match stats describe only benchmark/token overlap, not hardware disclosure coverage.

`buildGraph` imports the browser-safe hardware catalogue so UI and API share identical facts. Unfiltered graph views retain catalogue nodes even when top-N excludes the model with a hardware disclosure. Filtered regional/category views do not imply hardware usage from developer origin. MLPerf systems are separate server nodes, not model version suffixes.

## Security & constraints

- Public endpoints are read-only except scrape/refresh/ingest, which only write validated, normalized data.
- No Node-native packages server-side; Python runs only offline.
- Browser-only libraries are dynamically imported to stay SSR-safe.

## Ontology layer

Four OWL/Turtle schemas mirror the data model: `leaderboard.ttl`, `tokens.ttl`, `knowledge-graph.ttl` and `hardware.ttl`. The hardware schema defines accelerator, server system, hardware vendor, specifications, measurements, disclosures and workload estimates, with provenance-sensitive relationships. The graph ontology imports the other three. `/docs` → Ontology downloads them and computes declaration/triple metrics in the browser (triple count is approximate).

## Hardware data and refresh boundaries

The hardware page loader uses `queryClient.ensureQueryData(hardwareQueryOptions)` and the component uses `useSuspenseQuery`. A read-only server function fetches the newest readable MLPerf Inference summary (v6.1 → v6.0 → v5.1), with timeouts and bounded retries; it returns an unavailable state rather than fabricated results. Five-minute polling and focus refetch update measured results. Curated product values ship as configuration and do not get their verification dates changed by polling.

The primary MLPerf collector reuses this parser, picks the highest Offline closed-division tokens/s result per workload for the existing dashboard, and stores structured `hardware_context` alongside each normalized record. Failed collection retains previous records. The hardware page displays all qualifying measured configurations, not just the dashboard winners. Prices remain unverified; no new database table or anonymous write API is introduced.

## Memory sizing contract

All calculations use decimal GB. Weights = parameters × bytes per weight. Full-training Adam states use 14 additional bytes per trainable parameter (BF16 gradients, FP32 master weights and two FP32 moments); adapter weights use two bytes per adapter parameter. QLoRA base weights use 0.5 bytes per parameter, excluding quantization metadata which belongs in the explicit runtime budget.

Inference KV cache = 2 × layers × KV heads × head dimension × sequence length × concurrency × KV bytes (BF16 by default). Unknown architecture omits KV cache and explicitly marks the result incomplete. Activations/runtime are a user budget, not a derived prediction. Reserved memory is applied as subtotal / (1 − reserve fraction). Accelerator count is a memory lower bound plus a separate 25% contingency envelope, not a validated tensor-parallel layout. Pretraining needs token-volume, checkpoint, data-pipeline and networking assessment beyond these memory figures.

## Documentation

`README.md`, `docs/HOW_TO_USE.md`, `docs/ARCHITECTURE.md` are imported raw into `/docs`; repo-relative links are rewritten to tab switches so they work in-app and on GitHub.

## Domain categories and specialist catalogue
`extractBenchlmBenchmark` parses BenchLM `/benchmarks/<slug>` tables (HealthBench, HealthBench Hard, LABBench2, CyberGym); `extractMedhelm` parses the MedHELM "Current leaders" block. The unranked catalogue lives in `src/data/specialist-models.json` and feeds both the dashboard panel and `buildGraph` (model → category `belongs_to`, developer `builds`, `based_in`). Self-reported claims are text only and never enter score rankings.
