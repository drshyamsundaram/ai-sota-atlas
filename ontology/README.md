# Ontologies

Turtle (OWL) schemas, one per section of the AI SOTA Shift Tracker. Prefix `sota:` = `https://ai-sota-atlas.lovable.app/ontology#`.

| File | Section |
| --- | --- |
| `leaderboard.ttl` | Leaderboard dashboard (`/`) |
| `tokens.ttl` | Token utilisation report (`/tokens`) |
| `knowledge-graph.ttl` | AI-SOTA KG (`/knowledge-graph`); imports the other three |
| `hardware.ttl` | Hardware & Chipsets (`/hardware`); facts, measurements, disclosures and workload estimates |

## Metrics

| Metric | leaderboard | tokens | knowledge-graph | hardware |
| --- | --- | --- | --- | --- |
| Classes | 7 | 8 | 10 | 9 |
| Object properties | 7 | 6 | 13 | 8 |
| Datatype properties | 10 | 7 | 5 | 12 |
| SubClassOf axioms | 0 | 0 | 9 | 3 |

Live metrics (including triples and domain/range axioms) are shown in the app under **Docs → Ontology**, where the files can also be downloaded.
