/* ============================================================
   Development Map — 3D city view of the portfolio (1..50 projects)
   ============================================================ */

import React, { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Html } from "@react-three/drei";

import Building from "./Building.jsx";
import MapLegend from "./MapLegend.jsx";
import MapInspector from "./MapInspector.jsx";
import { computeLayout } from "./cityLayout.js";
import { CATEGORY_SHORT, shapeForProject } from "./buildingShape.js";
import {
  makeHeightScale, stateColor, STATE_LABELS, DEFAULT_METRIC, sceneChrome,
  isAddable, ADD_HIGHLIGHT,
} from "./mapPalette.js";

const ACCENT = "#43D9C7";

function DistrictPlane({ district, chrome }) {
  return (
    <group>
      <mesh position={[district.centerX, 0.02, district.centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[district.width, district.depth]} />
        <meshStandardMaterial color={district.tint} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <Html
        position={[district.centerX, 0.05, district.centerZ + district.depth / 2 + 0.7]}
        center
        distanceFactor={26}
        style={{ pointerEvents: "none" }}
      >
        <div style={{ whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: chrome.hudMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {CATEGORY_SHORT[district.category]}
        </div>
      </Html>
    </group>
  );
}

export default function DevelopmentMapTab({ sim, theme, actions, focusedProjectId }) {
  const [metric, setMetric] = useState(DEFAULT_METRIC);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  const chrome = sceneChrome(theme);
  const projects = sim.projects;

  const { buildings, districts, bounds } = useMemo(() => computeLayout(projects), [projects]);
  const heightScale = useMemo(() => makeHeightScale(metric, projects), [metric, projects]);
  const byId = useMemo(() => {
    const m = {};
    for (const p of projects) m[p.id] = p;
    return m;
  }, [projects]);

  const handleSelect = (id) => {
    const p = byId[id];
    if (!p) return;
    if (actions?.onFocusProject) actions.onFocusProject(id);
    if (p.state === "available") { setSelectedId(null); actions.onPreview(p); }
    else setSelectedId(id);
  };

  const selected = selectedId ? byId[selectedId] : null;
  const hovered = hoveredId ? byId[hoveredId] : null;
  const hoveredPos = hoveredId ? buildings.find((b) => b.id === hoveredId) : null;

  const camDist = Math.max(bounds.width, 32) * 0.62;

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 320, borderRadius: 10, overflow: "hidden", background: chrome.background }}>
      <Canvas
        shadows
        camera={{ position: [0, camDist * 0.78, camDist], fov: 42, near: 0.1, far: 600 }}
        onPointerMissed={() => setSelectedId(null)}
        dpr={[1, 2]}
      >
        <color attach="background" args={[chrome.background]} />
        <ambientLight intensity={chrome.ambient} />
        <directionalLight position={[26, 38, 22]} intensity={chrome.directional} castShadow />
        <directionalLight position={[-22, 20, -16]} intensity={chrome.directional * 0.38} />

        {/* ground + grid */}
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[bounds.width + 44, bounds.depth + 64]} />
          <meshStandardMaterial color={chrome.ground} roughness={1} metalness={0} />
        </mesh>
        <Grid
          position={[0, 0.01, 0]}
          args={[bounds.width + 44, bounds.depth + 64]}
          cellSize={4.4}
          cellColor={chrome.grid}
          sectionSize={17.6}
          sectionColor={chrome.grid}
          fadeDistance={camDist * 3}
          fadeStrength={1}
          infiniteGrid={false}
        />

        {districts.map((d) => (
          <DistrictPlane key={d.category} district={d} chrome={chrome} />
        ))}

        {buildings.map((b) => {
          const p = byId[b.id];
          if (!p) return null;
          return (
            <Building
              key={b.id}
              building={b}
              project={p}
              height={heightScale(p)}
              color={stateColor(p.state)}
              padColor={chrome.grid}
              accent={ACCENT}
              addable={isAddable(p, sim)}
              addColor={ADD_HIGHLIGHT}
              selected={selectedId === b.id}
              focused={focusedProjectId === b.id}
              onSelect={handleSelect}
              onHover={(id) => {
                setHoveredId(id);
                if (actions?.onFocusProject) actions.onFocusProject(id);
              }}
            />
          );
        })}

        {/* hover tooltip */}
        {hovered && hoveredPos && (
          <Html
            position={[hoveredPos.x, heightScale(hovered) + 1.5, hoveredPos.z]}
            center
            distanceFactor={20}
            style={{ pointerEvents: "none" }}
          >
            <div style={{
              whiteSpace: "nowrap", fontSize: 12, padding: "5px 9px", borderRadius: 6,
              background: chrome.background + "f5", border: `1px solid ${chrome.grid}`,
              color: chrome.hudText, boxShadow: "0 4px 14px #0004",
            }}>
              <strong>{hovered.id}</strong> {hovered.title}
              <span style={{ color: chrome.hudMuted, fontSize: 11 }}> · {shapeForProject(hovered).shortLabel}</span>
              <span style={{ color: stateColor(hovered.state), fontWeight: 700 }}> · {STATE_LABELS[hovered.state]}</span>
            </div>
          </Html>
        )}

        <OrbitControls
          target={[0, 1.5, 0]}
          enablePan
          enableDamping
          maxPolarAngle={Math.PI / 2.15}
          minDistance={10}
          maxDistance={bounds.width * 1.85 + 45}
        />
      </Canvas>

      <MapLegend metric={metric} setMetric={setMetric} chrome={chrome} />
      {selected && (
        <MapInspector
          sim={sim}
          project={selected}
          actions={actions}
          chrome={chrome}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
