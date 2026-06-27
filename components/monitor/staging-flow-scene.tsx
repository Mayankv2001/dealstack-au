"use client";

/**
 * StagingFlowScene — the WebGL half of the Monitor "staging flow" visual.
 *
 * This module imports three.js / @react-three/fiber at the top level, so it is
 * ONLY ever loaded on the client via a `dynamic(..., { ssr: false })` import in
 * StagingFlowViz (Next.js 16 forbids `ssr: false` in Server Components). It is
 * a pure presentation layer — it renders whatever metrics it is handed and
 * never fetches, writes, or reads any data itself.
 *
 * Visual metaphor:
 *   - Central layered cylinder  → the Supabase `feed_items` staging queue.
 *   - Outer floating nodes      → enabled (approved) feed sources.
 *   - Glowing travelling packets → fetched deal signals being staged.
 *
 * Colour language matches the rest of the monitor: emerald = live / fetching,
 * amber = idle / waiting (backoff), against a dark slate viewport.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Line, OrbitControls, Sparkles } from "@react-three/drei";
import * as THREE from "three";

// --- Theme constants (soft-emerald fintech palette) -------------------------
const EMERALD = "#10b981";
const EMERALD_LIGHT = "#34d399";
const AMBER = "#f59e0b";
const AMBER_LIGHT = "#fbbf24";
const SLATE_NODE = "#1e293b"; // slate-800
const SLATE_LINE = "#334155"; // slate-700
const FOG_SLATE = "#020617"; // slate-950

export interface StagingFlowSceneProps {
  /** Monitor is armed and live (emerald, packets stream) vs idle/backoff (amber, packets idle). */
  isFetching: boolean;
  /** Total staged feed_items — scales the central hub's presence. */
  stagedItemCount: number;
  /** Enabled feed sources — number of outer nodes (clamped for layout). */
  activeSources: number;
  /** Honour prefers-reduced-motion: freeze all per-frame animation. */
  reducedMotion?: boolean;
}

const MAX_NODES = 8;
const HUB_POINT = new THREE.Vector3(0, 0, 0);

interface SourceLayout {
  position: THREE.Vector3;
  curve: THREE.QuadraticBezierCurve3;
}

/** Distribute N source nodes on a ring around the vertical hub, with gentle height variation. */
function buildSources(count: number): SourceLayout[] {
  const n = Math.max(0, Math.min(MAX_NODES, count));
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2;
    const radius = 3.3;
    const y = i % 2 === 0 ? 0.9 : -0.9;
    const position = new THREE.Vector3(
      Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius
    );
    // Arc the packet path slightly upward through a mid control point.
    const mid = position.clone().multiplyScalar(0.5);
    mid.y += 1.4;
    const curve = new THREE.QuadraticBezierCurve3(
      position.clone(),
      mid,
      HUB_POINT.clone()
    );
    return { position, curve };
  });
}

// --- Central hub ------------------------------------------------------------
function CentralHub({
  accent,
  intensity,
  reducedMotion,
}: {
  accent: string;
  intensity: number;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);

  useFrame((state, delta) => {
    if (reducedMotion) return;
    if (group.current) group.current.rotation.y += delta * 0.3;
    if (ring.current) ring.current.rotation.y -= delta * 0.5;
    // Subtle "heartbeat" on the emissive layers while live.
    const pulse = intensity + Math.sin(state.clock.elapsedTime * 2) * 0.18;
    for (const m of materials.current) m.emissiveIntensity = pulse;
  });

  const layers = [0, 1, 2];

  return (
    <group ref={group}>
      {layers.map((i) => (
        <mesh key={i} position={[0, (i - 1) * 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.95 - i * 0.06, 0.95 - i * 0.06, 0.45, 56]} />
          <meshStandardMaterial
            ref={(m) => {
              if (m) materials.current[i] = m;
            }}
            color={SLATE_NODE}
            emissive={accent}
            emissiveIntensity={intensity}
            metalness={0.65}
            roughness={0.3}
          />
        </mesh>
      ))}
      {/* Tech accent ring orbiting the hub middle. */}
      <mesh ref={ring} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[1.35, 0.025, 12, 64]} />
        <meshBasicMaterial color={accent} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

// --- A single feed source node ----------------------------------------------
function SourceNode({
  position,
  accent,
  reducedMotion,
}: {
  position: THREE.Vector3;
  accent: string;
  reducedMotion: boolean;
}) {
  const node = (
    <mesh position={position}>
      <icosahedronGeometry args={[0.34, 0]} />
      <meshStandardMaterial
        color={SLATE_NODE}
        emissive={accent}
        emissiveIntensity={0.7}
        metalness={0.5}
        roughness={0.35}
        flatShading
      />
    </mesh>
  );

  if (reducedMotion) return node;
  return (
    <Float speed={2} rotationIntensity={0.6} floatIntensity={0.5}>
      {node}
    </Float>
  );
}

// --- A glowing data packet travelling source → hub --------------------------
function DataPacket({
  curve,
  color,
  speed,
  offset,
  reducedMotion,
}: {
  curve: THREE.QuadraticBezierCurve3;
  color: string;
  speed: number;
  offset: number;
  reducedMotion: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  // Stable starting point for the reduced-motion / first frame.
  const start = useMemo(() => curve.getPoint(offset % 1), [curve, offset]);

  useFrame((state) => {
    if (reducedMotion || !mesh.current) return;
    const t = (state.clock.elapsedTime * speed + offset) % 1;
    const p = curve.getPoint(t);
    mesh.current.position.copy(p);
    if (halo.current) halo.current.position.copy(p);
    // Fade as the packet is absorbed into the hub (t → 1).
    const fade = Math.min(1, (1 - t) * 4);
    const s = 0.5 + fade * 0.6;
    mesh.current.scale.setScalar(s);
    if (halo.current) halo.current.scale.setScalar(s * 2.4);
  });

  return (
    <group>
      <mesh ref={mesh} position={start}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={start}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.22}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// --- The flowing connections + packets per source ---------------------------
function StagingFlow({
  sources,
  isFetching,
  reducedMotion,
}: {
  sources: SourceLayout[];
  isFetching: boolean;
  reducedMotion: boolean;
}) {
  const accent = isFetching ? EMERALD_LIGHT : AMBER_LIGHT;
  // More, faster packets while live; a single slow trickle while idle.
  const packetsPerSource = isFetching ? 3 : 1;
  const baseSpeed = isFetching ? 0.32 : 0.12;

  return (
    <>
      {sources.map((src, i) => (
        <group key={i}>
          <Line
            points={src.curve.getPoints(28)}
            color={SLATE_LINE}
            lineWidth={1}
            transparent
            opacity={0.4}
          />
          <SourceNode
            position={src.position}
            accent={accent}
            reducedMotion={reducedMotion}
          />
          {Array.from({ length: packetsPerSource }, (_, p) => (
            <DataPacket
              key={p}
              curve={src.curve}
              color={accent}
              speed={baseSpeed + p * 0.04}
              offset={(p / packetsPerSource + i * 0.13) % 1}
              reducedMotion={reducedMotion}
            />
          ))}
        </group>
      ))}
    </>
  );
}

// --- Scene root -------------------------------------------------------------
function Scene({
  isFetching,
  stagedItemCount,
  activeSources,
  reducedMotion,
}: Required<StagingFlowSceneProps>) {
  const sources = useMemo(() => buildSources(activeSources), [activeSources]);
  const accent = isFetching ? EMERALD : AMBER;
  // Hub glows brighter the fuller the staging queue is (gently capped).
  const hubIntensity =
    (isFetching ? 0.55 : 0.3) + Math.min(stagedItemCount / 40, 1) * 0.4;

  return (
    <>
      <color attach="background" args={[FOG_SLATE]} />
      <fog attach="fog" args={[FOG_SLATE, 9, 22]} />

      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 3]} intensity={2.2} />
      <pointLight position={[0, 0, 0]} color={accent} intensity={6} distance={12} />

      <CentralHub
        accent={accent}
        intensity={hubIntensity}
        reducedMotion={reducedMotion}
      />

      <StagingFlow
        sources={sources}
        isFetching={isFetching}
        reducedMotion={reducedMotion}
      />

      {/* Ambient "data dust" around the hub for depth. */}
      <Sparkles
        count={40}
        scale={6}
        size={2}
        speed={reducedMotion ? 0 : 0.3}
        opacity={0.5}
        color={isFetching ? EMERALD_LIGHT : AMBER_LIGHT}
      />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableRotate={!reducedMotion}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.4}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.8}
      />
    </>
  );
}

export default function StagingFlowScene({
  isFetching,
  stagedItemCount,
  activeSources,
  reducedMotion = false,
}: StagingFlowSceneProps) {
  // R3F occasionally mis-measures the canvas on mount (leaving it at the
  // 300×150 default until a window resize) in some bundler/timing setups.
  // Nudge a measure across the first few hundred ms so the canvas fills its
  // container regardless of when R3F's resize listener finishes attaching.
  useEffect(() => {
    const fire = () => window.dispatchEvent(new Event("resize"));
    const raf = requestAnimationFrame(fire);
    const timers = [80, 250, 500].map((ms) => setTimeout(fire, ms));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1.6, 7.8], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      frameloop={reducedMotion ? "demand" : "always"}
      resize={{ offsetSize: true, debounce: 0 }}
    >
      <Scene
        isFetching={isFetching}
        stagedItemCount={stagedItemCount}
        activeSources={activeSources}
        reducedMotion={reducedMotion}
      />
    </Canvas>
  );
}
