# How to use the dashboard

## 1. Get fresh data
1. Open the **Dashboard** (`/`).
2. Press **Refresh now**. The app collects every leaderboard and the token feeds, stores a new batch and reloads all pages, including the knowledge graph. The header shows the latest batch time and how many sources returned rows.
3. Optional: pick an **Auto-refresh** interval (1m – 6h) to keep re-reading the latest stored batch.

## 2. Explore leaderboards
- Choose a **category** (Global frontier, Hallucination & safety, Cybersecurity, Multimodal, AI infrastructure, India, China, Europe).
- Narrow with **Leaderboard filters**: metric, region, search.
- Read the charts, then the **Details** table for exact scores, ranks, sources and dates.
- **Import JSON** lets you preview your own normalized records file without saving it.

## 3. Token utilisation report (`/tokens`)
- Pick a **slice**: All usage, a programming language or a spoken language.
- Filter by **country** or **developer**; click a country to drill down to its models.
- Check the **KPI band** and the **Data quality** panel (coverage, week covered, consistency checks).
- **Export CSV** for the rows you are viewing. The **Sources** panel lists every feed used.

## 4. LLM & Tokenomics KG (`/knowledge-graph`)
- Click the small graph on the home page or the menu link.
- Toggle node types, filter by country / category / slice, set **Top N**, or search a name.
- Click a node to see its connections, scores and token numbers; jump to the leaderboard or token report.
- Export **PNG** or **JSON**. The **Graph sources** panel shows where every node came from.
- The graph updates after every refresh, about once a minute, and when you return to the tab.

## 5. Use the data elsewhere
- REST API: see **API docs** (`/api-docs`); OpenAPI JSON at `/api/public/docs`.
- Ontologies: **Docs → Ontology** to download TTL files and view their metrics.

## 6. Reading the numbers carefully
- Token data covers OpenRouter traffic only; country = developer home country.
- Sites that draw tables in the browser may return no scores; nothing is invented.
- Model names differ between sources, so only some models are linked in the graph.


## Classic and new benchmarks
- **LMArena** ratings are human-preference Elo-style scores (unit `elo`); compare ranks, not absolute gaps.
- **MMMU** rows exclude the Human Expert reference rows.
- **MLPerf Inference** rows name the workload model (e.g. llama2-70b) and the submitting system in *Version*; read them as hardware throughput.
- ImageNet, COCO, GLUE/SuperGLUE, SQuAD and WMT are not tracked: they are saturated or rarely used for current LLMs.
