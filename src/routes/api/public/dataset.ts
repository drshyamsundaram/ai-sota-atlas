import { createFileRoute } from "@tanstack/react-router";
import { getLatestDataset } from "@/lib/dataset-store";

export const Route = createFileRoute("/api/public/dataset")({
  server: {
    handlers: {
      GET: async () => {
        const latest = await getLatestDataset();
        return new Response(
          JSON.stringify(
            latest ?? { generated_at: null, ingested_at: null, record_count: 0, records: [] },
          ),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      },
    },
  },
});
