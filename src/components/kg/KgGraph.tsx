import { ClientOnly } from "@tanstack/react-router";
import { forwardRef, lazy, Suspense } from "react";
import type { ForceGraphHandle } from "./ForceGraphCanvas";
import type { GraphNode, KnowledgeGraph } from "@/lib/graph";

const Canvas = lazy(() => import("./ForceGraphCanvas"));

type Props = {
  data: KnowledgeGraph;
  height: number;
  mini?: boolean;
  selectedId?: string | null;
  onSelect?: (n: GraphNode | null) => void;
};

export const KgGraph = forwardRef<ForceGraphHandle, Props>(function KgGraph(props, ref) {
  const fallback = (
    <div
      className="flex w-full items-center justify-center mono-label"
      style={{ height: props.height }}
    >
      loading graph…
    </div>
  );
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <Canvas ref={ref} {...props} />
      </Suspense>
    </ClientOnly>
  );
});

export type { ForceGraphHandle };
