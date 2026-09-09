import { createFileRoute } from "@tanstack/react-router";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "AI SOTA Shift Tracker API",
    version: "1.0.0",
    description:
      "Public, read-only REST API for normalized LLM leaderboard signals and granular token-utilisation data (model, developer and country level).",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/public/dataset": {
      get: {
        summary: "Latest normalized leaderboard dataset",
        responses: { "200": { description: "Dataset envelope with records array" } },
      },
    },
    "/api/public/scrape": {
      post: {
        summary: "Run the collector now (leaderboards + token utilisation) and store a new batch",
        responses: { "200": { description: "Batch summary" } },
      },
    },
    "/api/public/tokens": {
      get: {
        summary: "Granular token-utilisation records",
        parameters: [
          { name: "slice", in: "query", schema: { type: "string" }, description: "Slice id, e.g. overall, programming" },
          { name: "country", in: "query", schema: { type: "string" }, description: "Developer home country" },
          { name: "developer", in: "query", schema: { type: "string" } },
          { name: "model", in: "query", schema: { type: "string" }, description: "Substring match on model id or name" },
          {
            name: "group_by",
            in: "query",
            schema: { type: "string", enum: ["country", "developer", "model"] },
            description: "Return aggregated groups instead of rows",
          },
          { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"] } },
          { name: "limit", in: "query", schema: { type: "integer", default: 500, maximum: 2000 } },
        ],
        responses: { "200": { description: "Token records or aggregated groups" } },
      },
    },
    "/api/public/tokens/refresh": {
      post: {
        summary: "Re-collect token-utilisation data only",
        responses: { "200": { description: "Refresh summary" } },
      },
    },
  },
};

export const Route = createFileRoute("/api/public/docs")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(spec, null, 2), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
