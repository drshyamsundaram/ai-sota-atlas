import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { getLatestDataset } from "@/lib/dataset-store";
import { getLatestTokenDataset } from "@/lib/token-store";
import { buildGraph, type KnowledgeGraph } from "@/lib/graph";
import { searchGraphNodes } from "@/lib/graph-search";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId } from "./run-id.server";

export const PANINI_MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `You are Panini, the identification assistant for the AI-SOTA KG (a knowledge graph of LLMs, developers, countries, benchmarks, categories, token slices, accelerators, servers and hardware vendors).
Goal: help the user pin down the EXACT node(s) they mean through a short series of questions.
Rules:
- Always ground answers in the graph using the tools; never invent nodes, scores or token figures.
- If the request is ambiguous (several candidates), ask ONE focused follow-up question (e.g. developer, country, benchmark, category, size of usage) and list the top candidates.
- When you have narrowed it down, explain briefly why it matches (its connections).
- At the end of EVERY turn call the "identify" tool exactly once with the structured result (status "identified", "narrowing" or "not_found"), then write a short conversational answer.
- Self-reported or reference-only entries must be labelled as such. MLPerf links are hardware throughput, not model quality.`;

async function loadGraph(): Promise<KnowledgeGraph> {
  const [bench, tokens] = await Promise.all([getLatestDataset(), getLatestTokenDataset()]);
  return buildGraph(bench?.records ?? [], tokens?.records ?? []);
}

const brief = (n: KnowledgeGraph["nodes"][number]) => ({ id: n.id, type: n.type, label: n.label, tokens: n.tokens ?? null });

function makeTools(g: KnowledgeGraph) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const neighbours = (id: string) =>
    g.links
      .filter((l) => l.source === id || l.target === id)
      .map((l) => {
        const other = byId.get(l.source === id ? l.target : l.source);
        return other ? { relation: l.relation, direction: l.source === id ? "out" : "in", label: l.label ?? null, node: brief(other) } : null;
      })
      .filter(Boolean);
  return {
    search_nodes: tool({
      description: "Search all KG nodes by name (case-insensitive). Optionally restrict to a node type.",
      inputSchema: z.object({ query: z.string(), type: z.string().nullable().describe("model, developer, country, benchmark, category, slice, accelerator, server, hardware_vendor or null") }),
      execute: async ({ query, type }) => {
        const hits = searchGraphNodes(g.nodes, query).filter((n) => !type || n.type === type);
        return { total: hits.length, results: hits.slice(0, 15).map(brief) };
      },
    }),
    get_node: tool({
      description: "Get a node's details and all its connections by exact node id.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const n = byId.get(id);
        if (!n) return { error: "No node with that id" };
        const nb = neighbours(id);
        return { node: { ...brief(n), meta: n.meta ?? {} }, connection_count: nb.length, connections: nb.slice(0, 40) };
      },
    }),
    find_models: tool({
      description: "Find models connected to ALL given node ids (e.g. a developer, country, benchmark or category id). Country/category constraints resolve through developers/benchmarks.",
      inputSchema: z.object({ constraint_ids: z.array(z.string()) }),
      execute: async ({ constraint_ids }) => {
        const reach = (mid: string) => {
          const set = new Set<string>();
          for (const l of g.links) {
            if (l.source !== mid && l.target !== mid) continue;
            const o = l.source === mid ? l.target : l.source;
            set.add(o);
            for (const l2 of g.links) if (l2.source === o && (l2.relation === "based_in" || l2.relation === "belongs_to")) set.add(l2.target);
          }
          return set;
        };
        const models = g.nodes.filter((n) => n.type === "model" && constraint_ids.every((c) => reach(n.id).has(c)));
        models.sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0));
        return { total: models.length, results: models.slice(0, 20).map(brief) };
      },
    }),
    identify: tool({
      description: "Record the structured JSON result of this turn. Call exactly once per turn.",
      inputSchema: z.object({
        status: z.enum(["identified", "narrowing", "not_found"]),
        query_summary: z.string(),
        matches: z.array(z.object({ id: z.string(), label: z.string(), type: z.string(), reason: z.string() })),
        confidence: z.number().describe("0 to 1"),
        follow_up_question: z.string().nullable(),
      }),
      execute: async (input) => ({ recorded: true, ...input }),
    }),
  };
}

export async function runPanini(request: Request, messages: ModelMessage[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
  const graph = await loadGraph();
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses(PANINI_MODEL),
    instructions: INSTRUCTIONS,
    messages,
    tools: makeTools(graph),
    stopWhen: stepCountIs(50),
    abortSignal: request.signal,
    providerOptions: {
      openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
    },
  });
  return { result, runIdFetch };
}

export function errorResponse(err: unknown) {
  const status = (err as { statusCode?: number })?.statusCode ?? 500;
  const message =
    status === 429 ? "Panini is busy — please try again shortly." :
    status === 402 ? "AI credits are exhausted. Add credits in Settings → Plans & credits." :
    err instanceof Error ? err.message : "Panini failed";
  return new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
