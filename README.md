# LLM Leaderboard Watch

Build a tracking SOTA shifts LLM leaderboard links. Include an async web scraper that respects robots.txt, implements randomized delays (1–5 seconds), rotates User-Agents, and uses an extraction schema (e.g., Pydantic model) to parse leaderboard tables into JSON. Incorporate error handling with exponential backoff and a pandas processing script that cleans, standardizes column names, and exports the final aggregated dataset to the dashboard and allow it to be integrated. Use the "configuration json" and "Data structure normalized results form"

Configuration json

{

  "llm_status_spec": {

    "priority": [

      "Official benchmark or leaderboard page",

      "Regional or domain-specific benchmark",

      "Secondary summary only if needed"

    ],

    "report_fields": [

      "model_name",

      "model_version",

      "benchmark_name",

      "score_or_rank",

      "date",

      "scope_or_region"

    ],

    "max_items_per_category": 5,

    "categories": [

      {

        "id": "global_frontier",

        "title": "Global frontier",

        "sources": [

          "https://artificialanalysis.ai/leaderboards/models",

          "https://www.vellum.ai/llm-leaderboard",

          "https://lmarena.ai/leaderboard",

          "https://openrouter.ai/rankings",

          "https://paperswithcode.com/",

          "https://epoch.ai/benchmarks",

          "https://livebench.ai/",

          "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard",

          "https://huggingface.co/models"

        ]

      },

      {

        "id": "hallucination_safety",

        "title": "Hallucination and safety",

        "metrics": [

          "hallucination_rate",

          "factual_consistency",

          "faithfulness",

          "groundedness",

          "citation_accuracy"

        ],

        "sources": [

          "https://www.vectara.com/blog/hallucination-leaderboard",

          "https://hai.stanford.edu/ai-index/2026-ai-index-report",

          "https://www.artificialanalysis.ai/blog/ai-hallucination-rates-statistics-benchmarks-2026",

          "https://arxiv.org/abs/2501.05441",

          "https://arxiv.org/abs/2507.04016",

          "https://arxiv.org/abs/2509.14437",

          "https://arxiv.org/abs/2505.03102",

          "https://arxiv.org/abs/2409.12700",

          "https://genai.owasp.org/llm-top-10/",

          "https://labs.scale.com/leaderboard"

        ]

      },

      {

        "id": "india",

        "title": "India",

        "sources": [

          "https://arena.ai4bharat.org/",

          "https://ai4bharat.iitm.ac.in/",

          "https://huggingface.co/ai4bharat",

          "https://arxiv.org/abs/2501.13829",

          "https://www.benchlm.com/blog/best-indian-llm-2026",

          "https://www.aimultiple.com/open-source-vs-commercial-llms/",

          "https://www.business-friendly-llm.org/"

        ],

        "model_families": [

          "https://sarvam.ai/",

          "https://bharatgen.in/",

          "https://krutrim.com/",

          "https://gnani.ai/",

          "https://ai4bharat.iitm.ac.in/"

        ]

      },

      {

        "id": "india_commercial",

        "title": "India commercial fit",

        "evaluation_dimensions": [

          "capability",

          "usability",

          "adoption_cost",

          "token_cost",

          "local_language_quality",

          "code_mix_handling",

          "data_residency_fit"

        ],

        "distinct_families": [

          "Sarvam",

          "BharatGen",

          "Krutrim",

          "AI4Bharat",

          "Gnani"

        ]

      },

      {

        "id": "china",

        "title": "China",

        "sources": [

          "https://www.benchlm.com/blog/why-chinese-llm-rankings-disagree",

          "https://github.com/open-cn-llm/llm-leaderboard",

          "https://openrouter.ai/rankings"

        ]

      },

      {

        "id": "europe",

        "title": "Europe",

        "sources": [

          "https://www.benchlm.com/best/european-models",

          "https://mistral.ai/",

          "https://www.aleph-alpha.com/",

          "https://lighton.ai/",

          "https://hcompany.ai/",

          "https://arxiv.org/abs/2509.12345"

        ]

      }

    ]

  },

  "rules": [

    "Prefer direct benchmark pages over summaries.",

    "Separate global, regional, commercial, hallucination, and safety signals.",

    "For SLMs, emphasize latency, cost, footprint, and deployment constraints alongside accuracy.",

    "For hallucination, include hallucination_rate, factual_consistency, faithfulness, groundedness, and citation_accuracy when available.",

    "State benchmark contract differences (task type, domain, metric) when relevant.",

    "Keep outputs concise, current, and source-backed."

  ]

}


Data structure normalized results form

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

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ai-sota-atlas.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8a975322-4e1e-4dc3-a248-98d9c35881d6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
