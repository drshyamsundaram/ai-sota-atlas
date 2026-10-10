# Ontologies

Turtle (OWL) schemas, one per section of the AI SOTA Shift Tracker. Prefix `sota:` = `https://ai-sota-atlas.lovable.app/ontology#`.

| File | Section |
| --- | --- |
| `leaderboard.ttl` | Leaderboard dashboard (`/`) |
| `tokens.ttl` | Token utilisation report (`/tokens`) |
| `knowledge-graph.ttl` | LLM & Tokenomics KG (`/knowledge-graph`); imports the other two |

## Metrics

| Metric | leaderboard | tokens | knowledge-graph |
| --- | --- | --- | --- |
| Classes | 7 | 8 | 7 |
| Object properties | 6 | 6 | 6 |
| Datatype properties | 9 | 7 | 5 |
| Named individuals | 20 | 9 | 0 |
| SubClassOf axioms | 0 | 0 | 6 |

Live metrics (including triples and domain/range axioms) are shown in the app under **Docs → Ontology**, where the files can also be downloaded.
