import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/api-docs")({
  head: () => ({
    meta: [
      { title: "API Docs — AI SOTA Shift Tracker" },
      {
        name: "description",
        content:
          "Public REST API for LLM leaderboard signals and granular token-utilisation data by model, developer and country.",
      },
      { property: "og:title", content: "API Docs — AI SOTA Shift Tracker" },
      {
        property: "og:description",
        content: "Query token utilisation by model, developer, country and category in JSON or CSV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiDocs,
});

type Endpoint = {
  method: string;
  path: string;
  summary: string;
  params?: [string, string][];
  example: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/public/dataset",
    summary: "Latest normalized leaderboard dataset.",
    example: "/api/public/dataset",
  },
  {
    method: "POST",
    path: "/api/public/scrape",
    summary: "Run the collector now (leaderboards and token utilisation) and store a new batch.",
    example: "curl -X POST /api/public/scrape",
  },
  {
    method: "GET",
    path: "/api/public/tokens",
    summary: "Granular token-utilisation rows at model level.",
    params: [
      ["slice", "Category slice id, e.g. overall, programming, science"],
      ["country", "Developer home country, e.g. China"],
      ["developer", "Model developer, e.g. openai"],
      ["model", "Substring match on model id or name"],
      ["group_by", "country | developer | model — returns aggregates"],
      ["format", "json (default) or csv"],
      ["limit", "1–2000, default 500"],
    ],
    example: "/api/public/tokens?slice=programming&group_by=country",
  },
  {
    method: "POST",
    path: "/api/public/tokens/refresh",
    summary: "Re-collect token-utilisation data only.",
    example: "curl -X POST /api/public/tokens/refresh",
  },
  {
    method: "GET",
    path: "/api/public/docs",
    summary: "Machine-readable OpenAPI description of this API.",
    example: "/api/public/docs",
  },
];

function ApiDocs() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <nav className="mono-label mb-8 flex gap-4">
        <Link to="/" className="hover:text-primary">
          ← Dashboard
        </Link>
        <Link to="/tokens" className="hover:text-primary">
          Token utilisation
        </Link>
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight">Public REST API</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Every endpoint is open, read-only (except the refresh actions) and returns CORS-enabled
        JSON. The OpenAPI description lives at{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">/api/public/docs</code>.
      </p>

      <div className="mt-10 space-y-6">
        {ENDPOINTS.map((e) => (
          <section key={e.path + e.method} className="rounded-lg border border-border p-5">
            <div className="flex items-center gap-3">
              <span className="mono-label rounded bg-muted px-2 py-1 text-xs">{e.method}</span>
              <code className="text-sm font-medium">{e.path}</code>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{e.summary}</p>
            {e.params ? (
              <table className="mt-4 w-full text-left text-sm">
                <thead className="mono-label">
                  <tr>
                    <th className="pb-2">Parameter</th>
                    <th className="pb-2">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {e.params.map(([name, desc]) => (
                    <tr key={name} className="border-t border-border/60">
                      <td className="py-1.5 pr-4 font-mono text-xs">{name}</td>
                      <td className="py-1.5 text-muted-foreground">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <pre className="mt-4 overflow-x-auto rounded bg-muted/60 p-3 text-xs">{e.example}</pre>
          </section>
        ))}
      </div>
    </main>
  );
}
