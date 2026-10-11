<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Knowledge graph is built client/server by pure `buildGraph` in src/lib/graph.ts from the existing leaderboard + token datasets; canvas lib loads lazily behind ClientOnly (browser-only).
- Knowledge graph search queries the full dataset; selecting a result reveals it and its neighbors independently of top-N, with canvas focus after layout.
- Ontologies live in /ontology/*.ttl (one per site section) and are imported raw into /docs for download + metrics; keep them in sync with schema changes.
- Hardware specifications and server configurations live in the typed configuration-driven catalogue; keep measured MLPerf results, explicit model disclosures and memory estimates separate to preserve provenance.
- MLPerf records retain structured hardware context rather than putting systems in model versions, so graph identity stays model-centric and measured hardware remains inspectable.
- Hardware memory sizing uses decimal GB, explicit activation budgets and architecture-specific KV inputs; never derive throughput or training duration from theoretical compute.
- Unranked specialist models/platforms live in src/data/specialist-models.json and are shown as catalogue + KG nodes, never as scored rows — keeps self-reported claims out of rankings.
