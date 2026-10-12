import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, type UIMessage } from "ai";
import { errorResponse, runPanini } from "@/lib/panini/panini.server";
import { withLovableAiGatewayRunIdHeader } from "@/lib/panini/run-id.server";

export const Route = createFileRoute("/api/panini")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages?: UIMessage[] };
          if (!Array.isArray(body.messages)) return errorResponse(Object.assign(new Error("messages required"), { statusCode: 400 }));
          const { result, runIdFetch } = await runPanini(request, await convertToModelMessages(body.messages));
          return withLovableAiGatewayRunIdHeader(
            result.toUIMessageStreamResponse({ originalMessages: body.messages, sendReasoning: true, onError: (e) => (e instanceof Error ? e.message : "Panini failed") }),
            runIdFetch,
          );
        } catch (e) {
          return errorResponse(e);
        }
      },
    },
  },
});
