import type { HardwareFeed, HardwareMeasurement } from "./hardware-schema";

export function parseHardwareResults(input: unknown, round: string, sourceUrl: string, retrievedAt: string): HardwareMeasurement[] {
  if (!Array.isArray(input)) throw new Error("MLPerf results must be an array");
  const result: HardwareMeasurement[] = [];
  for (const value of input) {
    if (!value || typeof value !== "object") continue;
    const r = value as Record<string, unknown>;
    if (r['Suite'] !== "datacenter" || r['Scenario'] !== "Offline" || r['Performance_Units'] !== "Tokens/s" || r['Category'] !== "closed") continue;
    const score = Number(r['Performance_Result']);
    if (!Number.isFinite(score) || score <= 0 || typeof r['System'] !== "string" || typeof r['Model'] !== "string") continue;
    result.push({ id: `${round}:${r['ID']}:${r['Model']}:${r['System']}`, model: r['Model'],
      system: r['System'], submitter: String(r['Submitter'] ?? "Unknown"), round,
      scenario: "Offline", division: "closed", precision: String(r['weight_data_types'] ?? "Not disclosed"),
      accelerators: String(r['Accelerator'] ?? "Not disclosed"), value: score, unit: "Tokens/s", sourceUrl,
      retrievedAt });
  }
  return result;
}

export async function collectHardwareMeasurements(): Promise<HardwareFeed> {
  const checkedAt = new Date().toISOString();
  for (const round of ["6.1", "6.0", "5.1"]) {
    const sourceUrl = `https://raw.githubusercontent.com/mlcommons/inference_results_v${round}/main/summary_results.json`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt) await new Promise((r) => setTimeout(r, 800));
        const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(12_000), headers: { accept: "application/json" } });
        if (!response.ok) { if (response.status === 404) break; throw new Error("Source unavailable"); }
        const measurements = parseHardwareResults(await response.json(), `v${round}`, sourceUrl, checkedAt);
        if (measurements.length) return { measurements, checkedAt, sourceUrl, status: "ok" };
        break;
      } catch { /* bounded retry, then older published round */ }
    }
  }
  return { measurements: [], checkedAt, sourceUrl: null, status: "unavailable", error: "No readable MLPerf LLM results; previous benchmark rows are retained." };
}