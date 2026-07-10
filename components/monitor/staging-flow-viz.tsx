"use client";

/**
 * StagingFlowViz — client wrapper around the SVG staging-flow scene.
 *
 * The scene is plain SVG (see staging-flow-scene.tsx), so this wrapper no
 * longer needs WebGL detection, an error boundary, or a dynamic import — it
 * just supplies the panel chrome (shadcn `<Card>`, header, metric chips) and
 * honours prefers-reduced-motion. It performs no data access of its own.
 */

import * as React from "react";
import { Boxes, Radio, Rss } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import StagingFlowScene from "./staging-flow-scene";

export interface StagingFlowVizProps {
  /** Monitor armed & live (emerald, streaming) vs idle / waiting (amber). */
  isFetching: boolean;
  /** Total staged feed_items (drives the hub + headline stat). */
  stagedItemCount: number;
  /** Enabled feed sources → outer nodes. */
  activeSources: number;
  /** Items awaiting review — shown in the overlay. */
  pendingCount?: number;
  className?: string;
}

// --- Reduced-motion hook (useSyncExternalStore avoids setState-in-effect and
// SSR/CSR hydration mismatch; server + first client render agree on false). --
const getFalse = () => false;

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getFalse
  );
}

// --- Shared chrome ----------------------------------------------------------
function PanelHeader({ isFetching }: { isFetching: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-4">
      <div>
        <p className="font-heading text-sm font-medium text-slate-100">
          Staging flow
        </p>
        <p className="text-xs text-slate-400">
          Live view of feed signals staging into the queue
        </p>
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
          isFetching
            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
            : "bg-amber-500/15 text-amber-300 ring-amber-400/30"
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            isFetching ? "animate-pulse bg-emerald-400" : "bg-amber-400"
          )}
        />
        {isFetching ? "Monitor live" : "Monitor idle"}
      </span>
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-900/70 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
      <Icon className="size-4 text-emerald-300" />
      <div className="leading-tight">
        <p className="text-sm font-semibold tabular-nums text-slate-100">
          {value}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-slate-400">
          {label}
        </p>
      </div>
    </div>
  );
}

function MetricOverlay({
  stagedItemCount,
  activeSources,
  pendingCount,
}: {
  stagedItemCount: number;
  activeSources: number;
  pendingCount?: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap gap-2 p-4">
      <StatChip icon={Boxes} label="Staged" value={stagedItemCount} />
      <StatChip icon={Rss} label="Sources" value={activeSources} />
      {typeof pendingCount === "number" ? (
        <StatChip icon={Radio} label="Awaiting review" value={pendingCount} />
      ) : null}
    </div>
  );
}

export function StagingFlowViz({
  isFetching,
  stagedItemCount,
  activeSources,
  pendingCount,
  className,
}: StagingFlowVizProps) {
  const reducedMotion = useReducedMotion();

  return (
    <Card
      className={cn(
        // Zero the card padding/gap so the scene fills edge-to-edge.
        "relative h-[400px] w-full overflow-hidden bg-slate-950 [--card-spacing:0px]",
        className
      )}
    >
      <PanelHeader isFetching={isFetching} />

      <div className="h-full w-full">
        <StagingFlowScene
          isFetching={isFetching}
          stagedItemCount={stagedItemCount}
          activeSources={activeSources}
          reducedMotion={reducedMotion}
        />
      </div>

      <MetricOverlay
        stagedItemCount={stagedItemCount}
        activeSources={activeSources}
        pendingCount={pendingCount}
      />
    </Card>
  );
}

export default StagingFlowViz;
