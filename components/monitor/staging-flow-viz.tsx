"use client";

/**
 * StagingFlowViz — client wrapper around the 3D staging-flow scene.
 *
 * Responsibilities (all client-side):
 *   1. Dynamically import the WebGL scene with `ssr: false`. This MUST live in a
 *      Client Component — Next.js 16 rejects `ssr: false` in Server Components.
 *   2. Detect WebGL support and fall back to a 2D stat panel when it is absent.
 *   3. Wrap the scene in an ErrorBoundary so a runtime WebGL failure degrades to
 *      the same 2D fallback instead of crashing the admin page.
 *   4. Honour prefers-reduced-motion.
 *
 * It renders the canvas inside a shadcn `<Card>` and overlays the live metrics
 * passed down from the server, so the panel is informative even before (or
 * without) WebGL. It performs no data access of its own.
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { Boxes, Loader2, Radio, Rss } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StagingFlowSceneProps } from "./staging-flow-scene";

// Client-only: the scene pulls in three.js / WebGL and must never SSR.
const StagingFlowScene = dynamic(() => import("./staging-flow-scene"), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

export interface StagingFlowVizProps {
  /** Monitor armed & live (emerald, streaming) vs idle / waiting (amber). */
  isFetching: boolean;
  /** Total staged feed_items (drives the hub + headline stat). */
  stagedItemCount: number;
  /** Enabled feed sources → outer nodes. */
  activeSources: number;
  /** Items awaiting review — shown in the overlay/fallback only. */
  pendingCount?: number;
  className?: string;
}

// --- Error boundary (must be a class component) -----------------------------
class WebGLErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Non-fatal: log for diagnostics, the fallback renders instead.
    console.error("StagingFlowViz: WebGL scene failed, using fallback.", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// --- WebGL capability detection ---------------------------------------------
function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") ||
          canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// WebGL support is a one-time capability — cache the probe result.
let webglCache: boolean | null = null;
function getWebGLSupport(): boolean {
  if (webglCache === null) webglCache = detectWebGL();
  return webglCache;
}

// --- Client-detection hooks (useSyncExternalStore avoids setState-in-effect
// and the SSR/CSR hydration mismatch that plain useState/useEffect introduce). --
const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True only after client hydration — server + first client render agree on false. */
function useHydrated(): boolean {
  return React.useSyncExternalStore(subscribeNoop, getTrue, getFalse);
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

// --- Loading + fallback states ----------------------------------------------
function SceneSkeleton() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Loader2 className="size-6 animate-spin text-emerald-400" />
        <p className="text-xs">Initialising visualisation…</p>
      </div>
    </div>
  );
}

/** 2D fallback shown when WebGL is unavailable or the scene errors. */
function StaticFallback({
  isFetching,
  stagedItemCount,
  activeSources,
  pendingCount,
}: StagingFlowVizProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
      <div className="grid w-full max-w-md grid-cols-3 gap-2">
        <StatChip icon={Boxes} label="Staged" value={stagedItemCount} />
        <StatChip icon={Rss} label="Sources" value={activeSources} />
        <StatChip
          icon={Radio}
          label="Awaiting"
          value={pendingCount ?? 0}
        />
      </div>
      <p className="max-w-sm text-center text-xs text-slate-400">
        {isFetching ? "Monitor is live." : "Monitor is idle."} Interactive 3D
        view is unavailable in this browser — showing live metrics instead.
      </p>
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
  // Before hydration: render the skeleton (matches SSR, no mismatch). After:
  // probe WebGL synchronously during render — the result is cached.
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const webglOk = hydrated && getWebGLSupport();

  const sceneProps: StagingFlowSceneProps = {
    isFetching,
    stagedItemCount,
    activeSources,
    reducedMotion,
  };

  const fallback = (
    <StaticFallback
      isFetching={isFetching}
      stagedItemCount={stagedItemCount}
      activeSources={activeSources}
      pendingCount={pendingCount}
    />
  );

  return (
    <Card
      className={cn(
        // Zero the card padding/gap so the canvas fills edge-to-edge.
        "relative h-[400px] w-full overflow-hidden bg-slate-950 [--card-spacing:0px]",
        className
      )}
    >
      <PanelHeader isFetching={isFetching} />

      {!hydrated ? (
        <SceneSkeleton />
      ) : webglOk ? (
        <WebGLErrorBoundary fallback={fallback}>
          {/* In-flow, definitely-sized container so R3F measures correct
              dimensions on mount (an absolute wrapper can mis-measure to the
              300×150 canvas default until a window resize). */}
          <div className="h-full w-full">
            <StagingFlowScene {...sceneProps} />
          </div>
        </WebGLErrorBoundary>
      ) : (
        fallback
      )}

      {/* Live metrics overlay — only meaningful over the 3D view. */}
      {webglOk ? (
        <MetricOverlay
          stagedItemCount={stagedItemCount}
          activeSources={activeSources}
          pendingCount={pendingCount}
        />
      ) : null}
    </Card>
  );
}

export default StagingFlowViz;
