import { createFileRoute } from "@tanstack/react-router";
import type { ModelMessage } from "ai";
import { errorResponse, PANINI_MODEL, runPanini } from "@/lib/panini/panini.server";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-api-key, authorization" };

/** Constant-time string compare to avoid leaking the key via timing. */
function keyMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Non-streaming Panini endpoint: send the full conversation, get { answer, json }. Stateless. */
export const Route = createFileRoute("/api/public/panini")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const expected = process.env["PANINI_API_KEY"];
          const provided =
            request.headers.get("x-api-key") ??
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
            "";
          if (!expected || !keyMatches(provided, expected))
            return errorResponse(Object.assign(new Error("Valid API key required (x-api-key header or Bearer token)"), { statusCode: 401 }));
          const body = (await request.json()) as { messages?: { role: string; content: string }[]; message?: string };
          const raw = body.messages ?? (body.message ? [{ role: "user", content: body.message }] : []);
          const messages = raw
            .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
            .slice(-20)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })) as ModelMessage[];
          if (!messages.length || messages.at(-1)?.role !== "user")
            return errorResponse(Object.assign(new Error("Send 'message' or 'messages' ending with a user turn"), { statusCode: 400 }));
          const { result } = await runPanini(request, messages);
          const [answer, steps] = await Promise.all([result.text, result.steps]);
          const call = steps.flatMap((s) => s.toolCalls).filter((c) => c.toolName === "identify").at(-1);
          return new Response(JSON.stringify({ model: PANINI_MODEL, answer, json: call?.input ?? null }, null, 2), {
            status: 200,
            headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
          });
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
