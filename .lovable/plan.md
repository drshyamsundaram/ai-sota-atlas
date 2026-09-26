# LLM & Tokenomics Knowledge Graph

## What you get
1. **Mini graph on the landing page** — a small animated card (about 320px tall) near the top. Nodes drift gently and light up on hover. Clicking anywhere on it opens the full graph page.
2. **New page "LLM & Tokenomics KG"** (/knowledge-graph) — a full-screen interactive graph with zoom and pan, drag, search, filters, and a side panel that shows details for the node you pick. There is also a link to it in the header and footer.

## What the graph shows (built from data you already have, no new sources)
Types of dots (nodes), each with its own colour:
- **Model** (e.g. Claude Sonnet 5, DeepSeek V3)
- **Developer** (Anthropic, Qwen, Mistral...)
- **Country** (US, China, India, France...)
- **Benchmark / leaderboard** (LMArena, Vectara, LiveBench...)
- **Category** (Global frontier, Hallucination & safety, India, China, Europe)
- **Token slice** (All usage, Python, Hindi...)

Links between dots (edges):
- Developer → builds → Model
- Developer → based in → Country
- Model → scored on → Benchmark (label shows score or rank)
- Benchmark → belongs to → Category
- Model → used in → Token slice (thicker line = more tokens)

Sizing: model dots grow with total tokens processed. Benchmark-only models get a smaller base size.

## Interactions on the full page
- Filters: node types, region/country, category, token slice, "top N models by tokens".
- Search box that finds a node and zooms to it.
- Click a node to open a side panel with its connections, benchmark scores, token KPIs (tokens, share, growth), and links to the Leaderboard or Tokens report filtered to that item.
- Legend, a reset-view button, and PNG/JSON export of the graph.
- Stays up to date: it uses the same leaderboard and token datasets, so it refreshes after every "Refresh now" run.

## Also included
- A REST endpoint `/api/public/graph` that returns the nodes and edges as JSON, listed in the API docs.
- The graph uses the dashboard's existing dark style and chart colours.

## Technical details
- Library: `react-force-graph-2d` (canvas, d3-force). It only works in the browser, so it loads lazily behind ClientOnly to avoid server-render problems.
- `src/lib/graph.ts`: a pure `buildGraph(records, tokenRecords)` function that makes the entity names consistent (e.g. model-name aliases) and merges duplicates. Both the page and the API use it.
- The mini graph uses the same builder, capped at about 40 nodes (top models by tokens plus their developers, countries and main benchmarks), with zoom turned off and slow auto-motion.
- Data comes from the existing dataset and token queries, so no database changes are needed.
- New route `src/routes/knowledge-graph.tsx` gets its own head metadata.

## Caveat
Linking models across the two data sources depends on name matching, so a few models may show up only on the benchmark side or only on the token side. The data quality panel style will report how many models were matched.
