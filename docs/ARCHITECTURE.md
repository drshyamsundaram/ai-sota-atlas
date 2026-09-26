# Technical architecture

## Overview

```text
                +-------------------------------+
  Browser  ---> | TanStack Start (React 19, SSR)|
                |  /  /tokens  /knowledge-graph |
                |  /api-docs  /docs             |
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
| Framework | TanStack Start v1, React 19, Vite 7, edge (Worker) runtime |
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
| `src/routes/api/public/*` | dataset, scrape, ingest, tokens, tokens/refresh, graph, docs |

## Refresh flow

1. User clicks **Refresh now** → `POST /api/public/scrape`.
2. Collector fetches each source politely (robots.txt, 1–5 s jitter, backoff on 408/429/5xx).
3. Rows are validated with Zod; failed sources keep their previous rows.
4. Token collector runs in the same request.
5. New batch stored; client invalidates dataset, token and KG queries.

## Knowledge graph

Nodes: model, developer, country, benchmark, category, slice. Edges: builds, based_in, scored_on, belongs_to, used_in. Model names are normalized (vendor prefixes, "by x", parentheticals stripped) to merge leaderboard and token entities; match stats are returned with the graph.

## Security & constraints

- Public endpoints are read-only except scrape/refresh/ingest, which only write validated, normalized data.
- No Node-native packages server-side; Python runs only offline.
- Browser-only libraries are dynamically imported to stay SSR-safe.
