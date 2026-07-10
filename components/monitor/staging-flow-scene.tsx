/**
 * StagingFlowScene — the animated half of the Monitor "staging flow" visual.
 *
 * Pure SVG + SMIL. No WebGL, no three.js: the scene is a deterministic
 * pseudo-isometric projection, so it server-renders, never needs capability
 * detection, and weighs nothing. It is a pure presentation layer — it renders
 * whatever metrics it is handed and never fetches, writes, or reads any data.
 *
 * Visual metaphor (unchanged from the WebGL original):
 *   - Central layered cylinder   → the Supabase `feed_items` staging queue.
 *   - Outer floating nodes       → enabled (approved) feed sources.
 *   - Glowing travelling packets → fetched deal signals being staged.
 *
 * Colour language matches the rest of the monitor: emerald = live / fetching,
 * amber = idle / waiting (backoff), against a dark slate viewport.
 *
 * Reduced motion: when `reducedMotion` is set the SMIL <animate*> elements are
 * simply not rendered — packets freeze mid-path and the hub stops pulsing,
 * mirroring the frozen-frame behaviour of the old 3D scene.
 */

// --- Theme constants (soft-emerald fintech palette) -------------------------
const EMERALD = "#10b981";
const EMERALD_LIGHT = "#34d399";
const AMBER = "#f59e0b";
const AMBER_LIGHT = "#fbbf24";
const SLATE_NODE = "#1e293b"; // slate-800
const SLATE_EDGE = "#475569"; // slate-600
const SLATE_LINE = "#334155"; // slate-700

export interface StagingFlowSceneProps {
  /** Monitor is armed and live (emerald, packets stream) vs idle/backoff (amber, packets idle). */
  isFetching: boolean;
  /** Total staged feed_items — scales the central hub's glow. */
  stagedItemCount: number;
  /** Enabled feed sources — number of outer nodes (clamped for layout). */
  activeSources: number;
  /** Honour prefers-reduced-motion: freeze all animation. */
  reducedMotion?: boolean;
}

const MAX_NODES = 8;

/**
 * SVG coordinates are emitted as pre-rounded strings: React stringifies raw
 * floats slightly differently on the server vs the client (17 vs 16
 * significant digits), which trips hydration-mismatch warnings.
 */
function fmt(n: number): string {
  return n.toFixed(1);
}

// Scene geometry (viewBox units). The ring is an ellipse to fake perspective.
const VIEW_W = 800;
const VIEW_H = 400;
const HUB_X = 400;
const HUB_Y = 205;
const RING_RX = 290;
const RING_RY = 108;

interface SourceLayout {
  x: number;
  y: number;
  /** Pseudo-depth: negative = behind the hub, positive = in front. */
  z: number;
  /** SVG path from the node to the hub, arced gently upward. */
  path: string;
}

/** Distribute N source nodes on an elliptical ring around the hub, with gentle height variation. */
function buildSources(count: number): SourceLayout[] {
  const n = Math.max(0, Math.min(MAX_NODES, count));
  return Array.from({ length: n }, (_, i) => {
    // Offset the start angle so a lone node doesn't sit exactly on the hub's horizon.
    const angle = (i / n) * Math.PI * 2 + Math.PI / 7;
    const x = HUB_X + Math.cos(angle) * RING_RX;
    const y = HUB_Y + Math.sin(angle) * RING_RY + (i % 2 === 0 ? -26 : 26);
    const z = Math.sin(angle);
    // Quadratic bezier node → hub with the control point lifted for an arc.
    const cx = (x + HUB_X) / 2;
    const cy = (y + HUB_Y) / 2 - 56;
    const path = `M ${x.toFixed(1)} ${y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${HUB_X} ${HUB_Y}`;
    return { x, y, z, path };
  });
}

// --- A single feed source node ----------------------------------------------
function SourceNode({
  x,
  y,
  accent,
  index,
  reducedMotion,
}: {
  x: number;
  y: number;
  accent: string;
  index: number;
  reducedMotion: boolean;
}) {
  const r = 13;
  // Diamond with a flat top edge — reads as a faceted "icosahedron" glyph.
  const points = [
    `${fmt(x - r)},${fmt(y)}`,
    `${fmt(x - r * 0.45)},${fmt(y - r * 0.85)}`,
    `${fmt(x + r * 0.45)},${fmt(y - r * 0.85)}`,
    `${fmt(x + r)},${fmt(y)}`,
    `${fmt(x)},${fmt(y + r)}`,
  ].join(" ");
  return (
    <g>
      <polygon
        points={points}
        fill={SLATE_NODE}
        stroke={accent}
        strokeWidth={1.5}
        opacity={0.95}
      >
        {!reducedMotion && (
          // Gentle float: nudge the node up and down a few px, staggered per node.
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -6; 0 0"
            dur="3.6s"
            begin={`${-(index * 0.7)}s`}
            repeatCount="indefinite"
          />
        )}
      </polygon>
    </g>
  );
}

// --- A glowing data packet travelling source → hub --------------------------
function DataPacket({
  path,
  color,
  dur,
  begin,
  reducedMotion,
  staticPoint,
}: {
  path: string;
  color: string;
  dur: number;
  begin: number;
  reducedMotion: boolean;
  /** Frozen position (path midpoint-ish) rendered under reduced motion. */
  staticPoint: { x: number; y: number };
}) {
  if (reducedMotion) {
    return (
      <circle
        cx={fmt(staticPoint.x)}
        cy={fmt(staticPoint.y)}
        r={4}
        fill={color}
        opacity={0.8}
      />
    );
  }
  return (
    <g>
      {/* Soft halo trailing the packet. */}
      <circle r={9} fill={color} opacity={0.22}>
        <animateMotion
          path={path}
          dur={`${dur}s`}
          begin={`${begin}s`}
          repeatCount="indefinite"
        />
      </circle>
      <circle r={4} fill={color}>
        <animateMotion
          path={path}
          dur={`${dur}s`}
          begin={`${begin}s`}
          repeatCount="indefinite"
        />
        {/* Fade as the packet is absorbed into the hub. */}
        <animate
          attributeName="opacity"
          values="1;1;0.15"
          keyTimes="0;0.8;1"
          dur={`${dur}s`}
          begin={`${begin}s`}
          repeatCount="indefinite"
        />
      </circle>
    </g>
  );
}

/** Point on the quadratic bezier node→hub at parameter t (for frozen packets). */
function bezierPoint(src: SourceLayout, t: number): { x: number; y: number } {
  const cx = (src.x + HUB_X) / 2;
  const cy = (src.y + HUB_Y) / 2 - 56;
  const mt = 1 - t;
  return {
    x: mt * mt * src.x + 2 * mt * t * cx + t * t * HUB_X,
    y: mt * mt * src.y + 2 * mt * t * cy + t * t * HUB_Y,
  };
}

// --- Central hub ------------------------------------------------------------
function CentralHub({
  accent,
  glow,
  reducedMotion,
}: {
  accent: string;
  glow: number;
  reducedMotion: boolean;
}) {
  const layers = [0, 1, 2]; // bottom → top
  return (
    <g>
      {/* Accent glow pool under the hub — its opacity encodes queue fullness. */}
      <ellipse
        cx={HUB_X}
        cy={HUB_Y + 46}
        rx={120}
        ry={26}
        fill={accent}
        opacity={glow * 0.35}
      >
        {!reducedMotion && (
          <animate
            attributeName="opacity"
            values={`${glow * 0.25};${glow * 0.45};${glow * 0.25}`}
            dur="2.4s"
            repeatCount="indefinite"
          />
        )}
      </ellipse>

      {/* Stacked cylinder layers (drawn bottom-up so tops overlap correctly). */}
      {layers.map((i) => {
        const cy = HUB_Y + 30 - i * 30;
        const rx = 66 - i * 4;
        const ry = 20 - i;
        return (
          <g key={i}>
            {/* Side wall */}
            <path
              d={`M ${HUB_X - rx} ${cy - 14} L ${HUB_X - rx} ${cy} A ${rx} ${ry} 0 0 0 ${HUB_X + rx} ${cy} L ${HUB_X + rx} ${cy - 14} Z`}
              fill={SLATE_NODE}
              stroke={SLATE_EDGE}
              strokeWidth={0.75}
            />
            {/* Top disc with an accent rim */}
            <ellipse
              cx={HUB_X}
              cy={cy - 14}
              rx={rx}
              ry={ry}
              fill={SLATE_NODE}
              stroke={accent}
              strokeWidth={1.25}
              strokeOpacity={0.85}
            />
            {/* Emissive sheen that pulses while live */}
            <ellipse
              cx={HUB_X}
              cy={cy - 14}
              rx={rx * 0.62}
              ry={ry * 0.62}
              fill={accent}
              opacity={glow * 0.3}
            >
              {!reducedMotion && (
                <animate
                  attributeName="opacity"
                  values={`${glow * 0.2};${glow * 0.42};${glow * 0.2}`}
                  dur="2s"
                  begin={`${-i * 0.3}s`}
                  repeatCount="indefinite"
                />
              )}
            </ellipse>
          </g>
        );
      })}

      {/* Tech accent ring orbiting the hub (dash drift suggests rotation). */}
      <ellipse
        cx={HUB_X}
        cy={HUB_Y - 14}
        rx={104}
        ry={30}
        fill="none"
        stroke={accent}
        strokeWidth={1.5}
        strokeDasharray="10 14"
        opacity={0.55}
      >
        {!reducedMotion && (
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-96"
            dur="6s"
            repeatCount="indefinite"
          />
        )}
      </ellipse>
    </g>
  );
}

// --- Ambient "data dust" ------------------------------------------------------
/** Deterministic twinkle field (no randomness → SSR-stable markup). */
function DataDust({
  accent,
  reducedMotion,
}: {
  accent: string;
  reducedMotion: boolean;
}) {
  const specks = Array.from({ length: 26 }, (_, i) => {
    // Golden-angle scatter keeps the field organic but fully deterministic.
    const a = i * 2.39996;
    const rad = 60 + ((i * 53) % 140);
    return {
      x: HUB_X + Math.cos(a) * rad * 1.6,
      y: HUB_Y - 10 + Math.sin(a) * rad * 0.55,
      r: 1 + (i % 3) * 0.5,
      dur: 2.6 + (i % 5) * 0.7,
      begin: -((i * 0.47) % 3),
    };
  });
  return (
    <g>
      {specks.map((s, i) => (
        <circle key={i} cx={fmt(s.x)} cy={fmt(s.y)} r={s.r} fill={accent} opacity={0.3}>
          {!reducedMotion && (
            <animate
              attributeName="opacity"
              values="0.08;0.5;0.08"
              dur={`${s.dur}s`}
              begin={`${s.begin}s`}
              repeatCount="indefinite"
            />
          )}
        </circle>
      ))}
    </g>
  );
}

// --- Scene root -------------------------------------------------------------
export default function StagingFlowScene({
  isFetching,
  stagedItemCount,
  activeSources,
  reducedMotion = false,
}: StagingFlowSceneProps) {
  const sources = buildSources(activeSources);
  const accent = isFetching ? EMERALD : AMBER;
  const accentLight = isFetching ? EMERALD_LIGHT : AMBER_LIGHT;
  // Hub glows brighter the fuller the staging queue is (gently capped).
  const glow = (isFetching ? 0.55 : 0.3) + Math.min(stagedItemCount / 40, 1) * 0.4;
  // More, faster packets while live; a single slow trickle while idle.
  const packetsPerSource = isFetching ? 3 : 1;
  const baseDur = isFetching ? 3.2 : 8.5;

  const behind = sources.filter((s) => s.z < 0);
  const front = sources.filter((s) => s.z >= 0);

  const renderSource = (src: SourceLayout, i: number) => (
    <g key={`${src.x}-${src.y}`}>
      <path
        d={src.path}
        fill="none"
        stroke={SLATE_LINE}
        strokeWidth={1}
        opacity={0.4}
      />
      <SourceNode
        x={src.x}
        y={src.y}
        accent={accentLight}
        index={i}
        reducedMotion={reducedMotion}
      />
      {Array.from({ length: packetsPerSource }, (_, p) => (
        <DataPacket
          key={p}
          path={src.path}
          color={accentLight}
          dur={baseDur + p * 0.4}
          begin={-((p / packetsPerSource) * baseDur + i * 1.1)}
          reducedMotion={reducedMotion}
          staticPoint={bezierPoint(src, 0.3 + p * 0.22 + (i % 3) * 0.08)}
        />
      ))}
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-full w-full"
      role="img"
      aria-label={
        isFetching
          ? "Animated diagram: feed sources streaming signals into the staging queue"
          : "Animated diagram: feed sources idle around the staging queue"
      }
      preserveAspectRatio="xMidYMid slice"
    >
      <DataDust accent={accentLight} reducedMotion={reducedMotion} />
      {behind.map((s) => renderSource(s, sources.indexOf(s)))}
      <CentralHub accent={accent} glow={glow} reducedMotion={reducedMotion} />
      {front.map((s) => renderSource(s, sources.indexOf(s)))}
    </svg>
  );
}
