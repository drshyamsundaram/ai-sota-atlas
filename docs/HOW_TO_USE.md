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

## 4. AI-SOTA KG (`/knowledge-graph`)
- Click the small graph on the home page or the menu link.
- Toggle node types, filter by country / category / slice, set **Top N**, or search a name.
- Search checks the full graph, including nodes outside Top N. Choose a match or press Enter for the first result; selecting it clears filters and reveals its connections.
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
- New MLPerf batches retain the submitting system and weight precision as separate hardware details; older stored batches may still use the Version column until the next successful refresh.
- ImageNet, COCO, GLUE/SuperGLUE, SQuAD and WMT are not tracked: they are saturated or rarely used for current LLMs.

## 7. Hardware & Chipsets (`/hardware`)

1. Open **Hardware & Chipsets** from the menu. Filter by chip vendor or workload, or search an accelerator/server name.
2. In **Accelerators**, click a chip name for precision, compute, software and source details. Check two to four **Compare** boxes for the side-by-side table. Dense and sparse theoretical performance are not measured tokens/s.
3. Switch to **Servers** for accelerator count, aggregate memory, host CPU/RAM, storage, network topology and cooling. Unknown configuration values are left explicit; PSU ratings are not measured system draw.
4. Use **Workload sizing**: enter model parameters, precision, context/sequence length, concurrency/microbatch, runtime budget and memory reserve. LoRA/QLoRA also need adapter share. For inference, enter actual transformer layers, KV heads (not query heads) and head dimension; disable **Known KV-cache architecture** if these are unknown.
5. Treat the accelerator-count range as a memory-only planning envelope. Sequence length and batch affect activation requirements, which you must budget separately. Training estimates assume BF16 trainable parameters with FP32 Adam states. No time-to-train is predicted.
6. Read **Measured inference performance** by matching workload, scenario, accuracy target, precision and system size. These are MLPerf Offline results, not interactive latency. Search the measured systems separately from the catalogue.
7. **CSV** exports the filtered active catalogue tab. **Refresh now** runs the primary benchmark/token collection and rechecks MLPerf hardware results; product sheets retain their last verification date.
8. Review **Reported model–hardware relationships** and **Sources & verification**. The knowledge graph separates manufacturer composition, explicitly reported training and measured benchmark execution. Missing disclosures are not filled by guessing.
9. Download `hardware.ttl` alongside the other three schemas from **Docs → Ontology**; view live ontology metrics there. MLPerf Training and HPE configuration links are currently references, not populated benchmark/server claims.
