import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { NODE_TYPES, type GraphLink, type GraphNode, type KnowledgeGraph } from "@/lib/graph";

export type ForceGraphHandle = {
  zoomTo: (id: string) => void;
  reset: () => void;
  exportPng: () => void;
};

type Props = {
  data: KnowledgeGraph;
  height: number;
  mini?: boolean;
  selectedId?: string | null;
  onSelect?: (n: GraphNode | null) => void;
};

type SimNode = GraphNode & { x?: number; y?: number };
type SimLink = Omit<GraphLink, "source" | "target"> & { source: string | SimNode; target: string | SimNode };

function resolveColors(): any {
  const out: any = {};
  const el = document.createElement("span");
  document.body.appendChild(el);
  const read = (v: string) => {
    el.style.color = v;
    return getComputedStyle(el).color;
  };
  for (const t of NODE_TYPES) out[t.id] = read(t.color);
  out.fg = read("var(--foreground)");
  out.muted = read("var(--muted-foreground)");
  out.border = read("var(--border)");
  out.primary = read("var(--primary)");
  el.remove();
  return out;
}

const idOf = (v: string | SimNode) => (typeof v === "string" ? v : v.id);

const ForceGraphCanvas = forwardRef<ForceGraphHandle, Props>(function ForceGraphCanvas(
  { data, height, mini, selectedId, onSelect },
  ref,
) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<string | null>(null);
  const colors = useMemo<any>(() => (typeof document === "undefined" ? {} : resolveColors()), []);
  const graphData = useMemo(
    () => ({ nodes: data.nodes.map((n) => ({ ...n })), links: data.links.map((l) => ({ ...l })) }),
    [data],
  );

  const focus = selectedId ?? hover;
  const neighbours = useMemo(() => {
    const s = new Set<string>();
    if (!focus) return s;
    s.add(focus);
    for (const l of data.links) {
      if (l.source === focus) s.add(l.target);
      if (l.target === focus) s.add(l.source);
    }
    return s;
  }, [focus, data.links]);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 600));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force("charge")?.strength(mini ? -40 : -90);
    g.d3Force("link")?.distance(mini ? 28 : 55);
  }, [mini, graphData]);

  // Gentle drift for the mini card
  useEffect(() => {
    if (!mini) return;
    const t = setTimeout(() => fg.current?.zoomToFit(400, 16), 1500);
    return () => clearTimeout(t);
  }, [mini, graphData, width]);

  useImperativeHandle(ref, () => ({
    zoomTo: (id) => {
      const n = (graphData.nodes as SimNode[]).find((x) => x.id === id);
      if (n?.x != null && n.y != null) {
        fg.current?.centerAt(n.x, n.y, 600);
        fg.current?.zoom(3, 600);
      }
    },
    reset: () => fg.current?.zoomToFit(600, 40),
    exportPng: () => {
      const canvas = wrap.current?.querySelector("canvas");
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "llm_tokenomics_kg.png";
      a.click();
    },
  }));

  return (
    <div ref={wrap} className="w-full" style={{ height }}>
      <ForceGraph2D
        ref={fg}
        width={width}
        height={height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={mini ? 200 : 300}
        d3VelocityDecay={0.3}
        enableZoomInteraction={!mini}
        enablePanInteraction={!mini}
        enableNodeDrag={!mini}
        onEngineStop={() => !selectedId && fg.current?.zoomToFit(400, mini ? 16 : 40)}
        onNodeHover={(n: any) => setHover(n?.id ?? null)}
        onNodeClick={(n: any) => onSelect?.(n as GraphNode)}
        onBackgroundClick={() => onSelect?.(null)}
        nodeLabel={(n: any) => `${n.label} · ${n.type}`}
        linkColor={(l: any) => {
          const on = focus && neighbours.has(idOf(l.source)) && neighbours.has(idOf(l.target));
          return on ? colors.primary : colors.border;
        }}
        linkWidth={(l: any) =>
          l.relation === "used_in" && l.weight ? Math.min(4, 0.5 + Math.log10(l.weight + 1) / 4) : 0.6
        }
        linkDirectionalParticles={mini ? 2 : 0}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.004}
        nodeCanvasObject={(n: any, ctx: CanvasRenderingContext2D, scale: number) => {
          const dim = focus && !neighbours.has(n.id);
          ctx.globalAlpha = dim ? 0.15 : 1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.size, 0, 2 * Math.PI);
          ctx.fillStyle = colors[n.type] ?? colors.fg;
          ctx.fill();
          if (n.id === selectedId) {
            ctx.lineWidth = 2 / scale;
            ctx.strokeStyle = colors.fg;
            ctx.stroke();
          }
          const showLabel = mini ? n.size > 9 : scale > 1.4 || n.size > 7 || neighbours.has(n.id);
          if (showLabel && !dim) {
            const fs = Math.max(9 / scale, 2.5);
            ctx.font = `${fs}px ui-monospace, monospace`;
            ctx.fillStyle = colors.fg;
            ctx.textAlign = "center";
            ctx.fillText(String(n.label).slice(0, 26), n.x, n.y + n.size + fs + 1);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(n: any, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.size + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
});

export default ForceGraphCanvas;
export type { SimLink };
