import { describe, expect, test } from "bun:test";
import { searchGraphNodes } from "../src/lib/graph-search";

const nodes = [
  { id: "model:other", label: "Other model", type: "model", size: 8 },
  { id: "server:dgx", label: "DGX H100", type: "server", size: 8 },
  { id: "accelerator:h100", label: "H100", type: "accelerator", size: 8 },
  { id: "accelerator:h100-sxm", label: "H100 SXM", type: "accelerator", size: 8 },
];

describe("graph search", () => {
  test("matches the full dataset with trimmed case-insensitive queries", () => {
    expect(searchGraphNodes(nodes, "  h100  ").map((n) => n.label)).toEqual(["H100", "H100 SXM", "DGX H100"]);
  });
  test("handles empty and unmatched queries", () => {
    expect(searchGraphNodes(nodes, "   ")).toEqual([]);
    expect(searchGraphNodes(nodes, "missing")).toEqual([]);
  });
});