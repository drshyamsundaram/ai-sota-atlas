import leaderboard from "../../ontology/leaderboard.ttl?raw";
import tokens from "../../ontology/tokens.ttl?raw";
import kg from "../../ontology/knowledge-graph.ttl?raw";
import hardware from "../../ontology/hardware.ttl?raw";

export type OntologyMetrics = {
  classes: number;
  objectProperties: number;
  datatypeProperties: number;
  individuals: number;
  subClassAxioms: number;
  domainRangeAxioms: number;
  triples: number;
  lines: number;
};

const count = (t: string, re: RegExp) => (t.match(re) ?? []).length;

/** Lightweight Turtle metrics: counts declarations by pattern (these files use one subject per line). */
export function ontologyMetrics(ttl: string): OntologyMetrics {
  const body = ttl.replace(/^@prefix.*$/gm, "");
  const statements = body.split(/\s\.\s*$/m).filter((s) => s.trim());
  let triples = 0;
  for (const s of statements) triples += s.split(/\s;\s*/).reduce((n, p) => n + p.split(/,\s/).length, 0);
  return {
    classes: count(ttl, /a owl:Class/g),
    objectProperties: count(ttl, /a owl:ObjectProperty/g),
    datatypeProperties: count(ttl, /a owl:DatatypeProperty/g),
    individuals: count(ttl, /^sota:\w+ a sota:\w+/gm),
    subClassAxioms: count(ttl, /rdfs:subClassOf/g),
    domainRangeAxioms: count(ttl, /rdfs:(domain|range)/g),
    triples,
    lines: ttl.split("\n").length,
  };
}

export const ONTOLOGIES = [
  { id: "leaderboard", label: "Leaderboard dashboard", file: "leaderboard.ttl", ttl: leaderboard },
  { id: "tokens", label: "Token utilisation report", file: "tokens.ttl", ttl: tokens },
  { id: "kg", label: "AI-SOTA KG", file: "knowledge-graph.ttl", ttl: kg },
  { id: "hardware", label: "Hardware & Chipsets", file: "hardware.ttl", ttl: hardware },
] as const;
