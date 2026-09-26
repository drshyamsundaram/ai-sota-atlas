import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import readme from "../../README.md?raw";
import architecture from "../../docs/ARCHITECTURE.md?raw";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — AI SOTA Shift Tracker" },
      { name: "description", content: "README and technical architecture of the AI SOTA Shift Tracker dashboard." },
      { property: "og:title", content: "Documentation — AI SOTA Shift Tracker" },
      { property: "og:description", content: "How the leaderboard, token report and knowledge graph work, plus architecture." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocsPage,
});

const TABS = { readme: { label: "README", md: readme }, arch: { label: "Architecture", md: architecture } };

function DocsPage() {
  const [tab, setTab] = useState<keyof typeof TABS>("readme");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link to="/" className="mono-label hover:text-primary">← Dashboard</Link>
        <h1 className="text-lg font-semibold">Documentation</h1>
        <div className="ml-auto flex gap-2">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`mono-label rounded border px-3 py-1 ${tab === k ? "border-primary text-primary" : "border-border hover:text-primary"}`}
            >
              {TABS[k].label}
            </button>
          ))}
        </div>
      </header>
      <article className="docs-md mx-auto max-w-4xl px-6 py-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{TABS[tab].md}</ReactMarkdown>
      </article>
    </div>
  );
}
