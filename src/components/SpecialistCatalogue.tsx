import { Badge } from "@/components/ui/badge";
import { EVIDENCE_LABEL, specialistModels, specialistNote } from "@/data/specialist-models";

/** Unranked catalogue of domain-specialist models and platforms for a category. */
export function SpecialistCatalogue({ category }: { category: string }) {
  const rows = specialistModels.filter((m) => m.category === category);
  if (!rows.length) return null;
  return (
    <div className="panel p-5">
      <h3 className="text-sm font-semibold">Specialist models & platforms</h3>
      <p className="mt-1 text-xs text-muted-foreground">{specialistNote}</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {rows.map((m) => (
          <li key={m.name} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <a href={m.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                {m.name}
              </a>
              <Badge variant="outline" className="shrink-0 text-[10px]">{EVIDENCE_LABEL[m.evidence]}</Badge>
            </div>
            <p className="mono-label mt-1">{m.developer} · {m.country}</p>
            <p className="mt-1 text-xs text-muted-foreground">{m.kind}</p>
            <p className="mt-1 text-xs">Benchmarks: {m.benchmarks.join(", ")}</p>
            {m.claim ? <p className="mt-1 text-xs text-muted-foreground">Claim: {m.claim}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
