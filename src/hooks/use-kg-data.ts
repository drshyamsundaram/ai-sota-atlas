import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { buildGraph } from "@/lib/graph";
import type { LeaderboardRecord } from "@/lib/schema";
import type { TokenRecord } from "@/lib/token-schema";

export function useKgData() {
  const bench = useQuery({
    queryKey: ["kg-dataset"],
    queryFn: async () => {
      const res = await fetch("/api/public/dataset", { cache: "no-store" });
      if (!res.ok) throw new Error("dataset failed");
      return (await res.json()) as { records: LeaderboardRecord[]; generated_at?: string };
    },
    staleTime: 60_000,
  });
  const tokens = useQuery({
    queryKey: ["kg-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/public/tokens?limit=2000", { cache: "no-store" });
      if (!res.ok) throw new Error("tokens failed");
      return (await res.json()) as { records: TokenRecord[]; generated_at?: string };
    },
    staleTime: 60_000,
  });
  const graph = useMemo(
    () => buildGraph(bench.data?.records ?? [], tokens.data?.records ?? []),
    [bench.data, tokens.data],
  );
  return {
    graph,
    tokenRecords: tokens.data?.records ?? [],
    benchRecords: bench.data?.records ?? [],
    isLoading: bench.isLoading || tokens.isLoading,
  };
}
