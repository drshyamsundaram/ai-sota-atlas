import { createFileRoute, Link } from "@tanstack/react-router";
import { Disclaimer } from "@/components/Disclaimer";
import { PaniniChat } from "@/components/panini/PaniniChat";

export const Route = createFileRoute("/panini")({
  head: () => ({
    meta: [
      { title: "Panini — AI-SOTA KG identification chatbot" },
      { name: "description", content: "Chat with Panini to pin down exact models, developers, benchmarks and chips in the AI-SOTA knowledge graph, with JSON output." },
      { property: "og:title", content: "Panini — AI-SOTA KG identification chatbot" },
      { property: "og:description", content: "Conversational, graph-grounded identification of LLMs, benchmarks and hardware with structured JSON results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaniniPage,
});

const CURL = `curl -X POST https://ai-sota-atlas.lovable.app/api/public/panini \\
  -H "content-type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Which Chinese model has the most tokens?"}]}'`;

function PaniniPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <nav className="mono-label mb-2 flex flex-wrap gap-4">
            <Link to="/" className="hover:text-primary">← Dashboard</Link>
            <Link to="/knowledge-graph" className="hover:text-primary">AI-SOTA KG</Link>
            <Link to="/api-docs" className="hover:text-primary">API docs</Link>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight">Panini</h1>
          <p className="mt-1 text-sm text-muted-foreground">Answer a few questions and Panini identifies the exact node in the AI-SOTA KG — with a conversational answer and a JSON result.</p>
        </div>
      </header>
      <Disclaimer />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        <PaniniChat />
        <section className="rounded-md border border-border bg-card p-4 text-sm">
          <h2 className="mono-label mb-2">Endpoint</h2>
          <p className="text-muted-foreground">POST <code>/api/public/panini</code> with the full conversation (stateless). Returns <code>{"{ answer, json }"}</code>.</p>
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">{CURL}</pre>
        </section>
      </main>
    </div>
  );
}
