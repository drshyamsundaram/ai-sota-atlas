# Enhance token slices, add benchmarks, add Cybersecurity category

## 1. More token slice categories
- Try OpenRouter's other live per-topic feeds: more programming languages (Java, C#, C++, PHP, SQL, Swift, Kotlin), more natural languages (French, Japanese, Chinese, Portuguese, Arabic, Korean, Tamil, Bengali), and use-case categories (roleplay, marketing, translation, legal, finance, health, science, academia, SEO, technology, trivia) if they return distinct data.
- Each candidate is checked live; only slices with genuinely different numbers are kept (the same "fake category" check used earlier).
- Group slices in the dropdown as Overall / Programming / Language / Use case.

## 2. Additional benchmarks (Global frontier and Hallucination)
Candidate live sources, added only if openly reachable and allowed by robots.txt:
- SWE-bench (coding agents), Aider polyglot leaderboard, BFCL (function calling), HELM (Stanford), SEAL (Scale), Humanity's Last Exam, ARC-AGI, SimpleQA/FACTS grounding.
- The September 2026 "LLM Leaderboard & AI Model Benchmarks" page you mentioned will be located and added under Global frontier as a secondary summary source.

## 3. New "Cybersecurity" evaluation category
- New category in the evaluation configuration, with metrics such as: task success rate, capture-the-flag solve rate, exploit/defense score, refusal on harmful requests.
- Sources: **Nilgiri** open cyber range (for AI agents) as the primary source, plus candidates like Cybench, CyberSecEval (Meta), CTIBench, and the OWASP LLM Top 10 as reference.
- Shows up automatically in the dashboard filters, charts, tables and the knowledge graph (as a category node linked to models it scores).
- Collector gets an extractor for these pages; if a page publishes no machine-readable table, it is listed as a reference source and marked "no scores extracted" rather than inventing numbers.

## Technical details
- Edit `pipeline/config.json` (new `cybersecurity` category + sources), `pipeline/token_config.json` (new slices + `group` field), collector extractors in `src/lib/collector.server.ts`, slice grouping in `src/routes/tokens.tsx`, category mapping in `pipeline/scraper.py`.
- Run a live refresh afterwards and report which new sources returned rows.

## Open point
Nilgiri's exact public URL is not in the conversation; I will search for it. If you have the link, share it and I will use that.
