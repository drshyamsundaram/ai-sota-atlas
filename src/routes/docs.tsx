import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download } from "lucide-react";
import readme from "../../README.md?raw";
import architecture from "../../docs/ARCHITECTURE.md?raw";
import howTo from "../../docs/HOW_TO_USE.md?raw";
import { ONTOLOGIES, ontologyMetrics } from "@/lib/ontology";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — AI SOTA Shift Tracker" },
      { name: "description", content: "README, how-to guide, architecture and ontology downloads for the AI SOTA Shift Tracker." },
      { property: "og:title", content: "Documentation — AI SOTA Shift Tracker" },
      { property: "og:description", content: "How to use the dashboard, its architecture, and downloadable TTL ontologies." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocsPage,
});

type Tab = "readme" | "howto" | "arch" | "ontology";
const MD: Record<Exclude<Tab, "ontology">, string> = { readme, howto: howTo, arch: architecture };
const LABELS: Record<Tab, string> = { readme: "README", howto: "How to use", arch: "Architecture", ontology: "Ontology" };

/** Map repo-relative markdown links onto tabs so they don't 404 inside the app. */
function tabForHref(href = ""): Tab | null {
  if (/ARCHITECTURE\.md/i.test(href)) return "arch";
  if (/HOW_TO_USE\.md/i.test(href)) return "howto";
  if (/README\.md$/i.test(href) && !/ontology/i.test(href)) return "readme";
  if (/ontology/i.test(href)) return "ontology";
  return null;
}

function download(file: string, ttl: string) {
  const url = URL.createObjectURL(new Blob([ttl], { type: "text/turtle" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  URL.revokeObjectURL(url);
}

function DocsPage() {
  const [tab, setTab] = useState<Tab>("readme");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex flex-wrap items-center gap-4">
        <Link to="/" className="mono-label hover:text-primary">← Dashboard</Link>
        <h1 className="text-lg font-semibold">Documentation</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          {(Object.keys(LABELS) as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`mono-label rounded border px-3 py-1 ${tab === k ? "border-primary text-primary" : "border-border hover:text-primary"}`}
            >
              {LABELS[k]}
            </button>
          ))}
        </div>
      </header>
      <article className="docs-md mx-auto max-w-4xl px-6 py-8">
        {tab === "ontology" ? (
          <OntologyTab />
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const t = tabForHref(href);
                if (t && href && !/^https?:/.test(href))
                  return (
                    <a href={`#${t}`} onClick={(e) => { e.preventDefault(); setTab(t); window.scrollTo(0, 0); }}>
                      {children}
                    </a>
                  );
                return <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{children}</a>;
              },
            }}
          >
            {MD[tab]}
          </ReactMarkdown>
        )}
      </article>
    </div>
  );
}

function OntologyTab() {
  const rows = ONTOLOGIES.map((o) => ({ ...o, m: ontologyMetrics(o.ttl) }));
  return (
    <div>
      <h1>Ontologies (Turtle / OWL)</h1>
      <p>
        One TTL file per section of the site, in the <code>ontology/</code> folder of the GitHub repository.
        Namespace: <code>https://ai-sota-atlas.lovable.app/ontology#</code> (prefix <code>sota:</code>).
      </p>
      <h2>Downloads</h2>
      <ul>
        {rows.map((o) => (
          <li key={o.id}>
            <button className="inline-flex items-center gap-2 text-primary hover:underline" onClick={() => download(o.file, o.ttl)}>
              <Download className="h-4 w-4" /> {o.file}
            </button>{" "}
            — {o.label}
          </li>
        ))}
      </ul>
      <h2>Ontology metrics</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            {rows.map((o) => <th key={o.id}>{o.file}</th>)}
          </tr>
        </thead>
        <tbody>
          {([
            ["Classes", "classes"],
            ["Object properties", "objectProperties"],
            ["Datatype properties", "datatypeProperties"],
            ["Named individuals", "individuals"],
            ["SubClassOf axioms", "subClassAxioms"],
            ["Domain / range axioms", "domainRangeAxioms"],
            ["Triples (approx.)", "triples"],
            ["Lines", "lines"],
          ] as const).map(([label, k]) => (
            <tr key={k}>
              <td>{label}</td>
              {rows.map((o) => <td key={o.id}>{o.m[k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p>Metrics are computed live from the files shipped with the app, so they stay in step with the repository.</p>
    </div>
  );
}
