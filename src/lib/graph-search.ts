import type { GraphNode } from "./graph";

/** Search the full graph, independently of the displayed top-N and filters. */
export function searchGraphNodes(nodes: GraphNode[], query: string): GraphNode[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  return nodes
    .filter((node) => node.label.toLocaleLowerCase().includes(q))
    .sort((a, b) => {
      const rank = (label: string) => {
        const text = label.toLocaleLowerCase();
        return text === q ? 0 : text.startsWith(q) ? 1 : 2;
      };
      return rank(a.label) - rank(b.label) || a.label.localeCompare(b.label);
    });
}