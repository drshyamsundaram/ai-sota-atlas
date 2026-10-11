import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

export const getHardwareMeasurements = createServerFn({ method: "GET" }).handler(async () => {
  const { collectHardwareMeasurements } = await import("./hardware-collector.server");
  return collectHardwareMeasurements();
});

export const hardwareQueryOptions = queryOptions({
  queryKey: ["hardware-measurements"], queryFn: () => getHardwareMeasurements(),
  staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true,
});