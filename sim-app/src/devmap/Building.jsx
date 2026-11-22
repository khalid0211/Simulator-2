/* ============================================================
   Development Map — Realistic 3D Architectural Models & Lifecycle Visuals
   Renders 12 distinct multi-mesh architectural archetypes corresponding to
   the 12 public-sector subcategories, plus live construction tower cranes,
   wireframe blueprints, scaffolding, and landscaping.
   ============================================================ */

import React, { useState, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { shapeForProject } from "./buildingShape.js";

/* ---- Shared miniature props ---- */
function MiniTree({ position, scale = 1 }) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.28, 6]} />
        <meshStandardMaterial color="#6b4c35" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <coneGeometry args={[0.2, 0.42, 7]} />
        <meshStandardMaterial color="#1f7a4c" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.56, 0]} castShadow>
        <coneGeometry args={[0.14, 0.3, 7]} />
        <meshStandardMaterial color="#27965c" roughness={0.75} />
      </mesh>
    </group>
  );
}

/* ---- Animated Tower Crane for Active / Suspended Projects ---- */
function ConstructionCrane({ height, active, suspended, fp }) {
  const jibRef = useRef();
  const craneH = Math.max(height + 0.7, 1.8);
  const craneColor = suspended ? "#d97706" : "#eab308";

  useFrame((_, delta) => {
    if (active && jibRef.current) {
      jibRef.current.rotation.y += delta * 0.45;
    }
  });

  return (
    <group position={[fp * 0.54, 0, -fp * 0.52]}>
      {/* Mast */}
      <mesh position={[0, craneH / 2, 0]} castShadow>
        <boxGeometry args={[0.11, craneH, 0.11]} />
        <meshStandardMaterial color={craneColor} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Rotating Jib assembly */}
      <group ref={jibRef} position={[0, craneH, 0]} rotation={[0, 0.6, 0]}>
        {/* Main Boom */}
        <mesh position={[-0.65, 0.04, 0]} castShadow>
          <boxGeometry args={[1.6, 0.08, 0.08]} />
          <meshStandardMaterial color={craneColor} metalness={0.3} roughness={0.5} />
        </mesh>
        {/* Counterweight */}
        <mesh position={[0.22, 0.02, 0]} castShadow>
          <boxGeometry args={[0.24, 0.14, 0.14]} />
          <meshStandardMaterial color="#334155" roughness={0.7} />
        </mesh>
        {/* Apex kingpost */}
        <mesh position={[0, 0.22, 0]}>
          <coneGeometry args={[0.07, 0.36, 4]} />
          <meshStandardMaterial color={craneColor} />
        </mesh>
        {/* Hook cable */}
        <mesh position={[-1.05, -0.32, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.65, 6]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
        <mesh position={[-1.05, -0.65, 0]}>
          <boxGeometry args={[0.12, 0.1, 0.12]} />
          <meshStandardMaterial color={craneColor} />
        </mesh>
      </group>
      {/* Suspended warning beacon */}
      {suspended && (
        <mesh position={[0, craneH + 0.45, 0]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.2} />
        </mesh>
      )}
    </group>
  );
}

/* ============================================================
   12 SUBCATEGORY ARCHITECTURAL ARCHETYPES
   ============================================================ */

/* 1. Paved Roads & Highways — Cable-Stayed Highway Viaduct & Interchange */
function HighwayArchetype({ fp, h, primaryMat, accentMat, glassMat, darkMat }) {
  const deckY = Math.min(1.1, Math.max(0.45, h * 0.28));
  const pylonH = Math.max(h, deckY + 0.8);
  return (
    <group>
      {/* Support piers */}
      {[-0.65, 0.65].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, deckY / 2, -0.35]} castShadow>
            <cylinderGeometry args={[0.11, 0.15, deckY, 10]} />
            {accentMat}
          </mesh>
          <mesh position={[0, deckY / 2, 0.35]} castShadow>
            <cylinderGeometry args={[0.11, 0.15, deckY, 10]} />
            {accentMat}
          </mesh>
        </group>
      ))}
      {/* Elevated Dual Carriageway Asphalt Deck */}
      <mesh position={[0, deckY, 0]} castShadow receiveShadow>
        <boxGeometry args={[fp * 1.12, 0.14, 1.35]} />
        {darkMat}
      </mesh>
      {/* Guardrails & Status-Colored Structural Beams */}
      <mesh position={[0, deckY + 0.08, 0.62]} castShadow>
        <boxGeometry args={[fp * 1.12, 0.12, 0.08]} />
        {primaryMat}
      </mesh>
      <mesh position={[0, deckY + 0.08, -0.62]} castShadow>
        <boxGeometry args={[fp * 1.12, 0.12, 0.08]} />
        {primaryMat}
      </mesh>
      {/* Center Highway Median & Dashed Markings */}
      {[-0.9, -0.3, 0.3, 0.9].map((x) => (
        <mesh key={x} position={[x, deckY + 0.075, 0]}>
          <boxGeometry args={[0.32, 0.02, 0.06]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
      {/* Twin Cable-Stayed Suspension Pylons */}
      {[-0.55, 0.55].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, pylonH / 2, -0.52]} castShadow>
            <boxGeometry args={[0.14, pylonH, 0.14]} />
            {primaryMat}
          </mesh>
          <mesh position={[0, pylonH / 2, 0.52]} castShadow>
            <boxGeometry args={[0.14, pylonH, 0.14]} />
            {primaryMat}
          </mesh>
          {/* Pylon cross-beam */}
          <mesh position={[0, pylonH * 0.82, 0]} castShadow>
            <boxGeometry args={[0.12, 0.12, 1.15]} />
            {primaryMat}
          </mesh>
          {/* Diagonal stay cables */}
          <mesh position={[0.28, (pylonH + deckY) / 2, 0.52]} rotation={[0, 0, 0.42]}>
            <cylinderGeometry args={[0.015, 0.015, Math.max(0.5, pylonH - deckY), 6]} />
            {glassMat}
          </mesh>
          <mesh position={[-0.28, (pylonH + deckY) / 2, -0.52]} rotation={[0, 0, -0.42]}>
            <cylinderGeometry args={[0.015, 0.015, Math.max(0.5, pylonH - deckY), 6]} />
            {glassMat}
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* 2. Feeder & Rural Roads — Rural Road & Truss Bridge over Stream */
function RuralRoadArchetype({ fp, h, primaryMat, accentMat, darkMat }) {
  const trussH = Math.max(0.65, h * 0.55);
  return (
    <group>
      {/* Blue River/Stream beneath bridge */}
      <mesh position={[0, 0.03, 0]} rotation={[0, 0.35, 0]}>
        <boxGeometry args={[0.85, 0.05, fp * 1.15]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.3} metalness={0.2} />
      </mesh>
      {/* Roadbed & Bridge Deck */}
      <mesh position={[0, 0.24, 0]} castShadow>
        <boxGeometry args={[fp * 1.08, 0.12, 1.05]} />
        {darkMat}
      </mesh>
      {/* Stone Bridge Abutments */}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 0.12, 0]} castShadow>
          <boxGeometry args={[0.55, 0.24, 1.18]} />
          {accentMat}
        </mesh>
      ))}
      {/* Truss Bridge Side Frames */}
      {[-0.48, 0.48].map((z) => (
        <group key={z} position={[0, 0.3, z]}>
          {/* Top chord */}
          <mesh position={[0, trussH, 0]} castShadow>
            <boxGeometry args={[1.55, 0.1, 0.09]} />
            {primaryMat}
          </mesh>
          {/* Vertical & end posts */}
          {[-0.72, -0.24, 0.24, 0.72].map((x) => (
            <mesh key={x} position={[x, trussH / 2, 0]} castShadow>
              <boxGeometry args={[0.09, trussH, 0.09]} />
              {primaryMat}
            </mesh>
          ))}
        </group>
      ))}
      {/* Overhead Portal Bracing */}
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} position={[x, 0.3 + trussH, 0]} castShadow>
          <boxGeometry args={[0.09, 0.08, 1.04]} />
          {primaryMat}
        </mesh>
      ))}
      <MiniTree position={[-0.95, 0, -0.85]} scale={0.85} />
      <MiniTree position={[0.92, 0, 0.85]} scale={0.95} />
    </group>
  );
}

/* 3. Buildings (Administrative) — Stepped Civic Complex with Atrium & Flagpole */
function CivicComplexArchetype({ fp, h, primaryMat, accentMat, glassMat }) {
  const podiumH = Math.min(0.65, h * 0.25);
  const wingH = Math.max(podiumH + 0.2, h * 0.58);
  return (
    <group>
      {/* Colonnade Podium */}
      <mesh position={[0, podiumH / 2, 0]} castShadow>
        <boxGeometry args={[fp * 0.98, podiumH, fp * 0.86]} />
        {accentMat}
      </mesh>
      {/* Central High-Rise Tower */}
      <mesh position={[0, h / 2, -0.1]} castShadow>
        <boxGeometry args={[fp * 0.48, h, fp * 0.48]} />
        {primaryMat}
      </mesh>
      {/* Glass Atrium Facade Strip */}
      <mesh position={[0, h * 0.52, 0.15]} castShadow>
        <boxGeometry args={[fp * 0.28, h * 0.86, 0.06]} />
        {glassMat}
      </mesh>
      {/* Left & Right Flanking Administrative Wings */}
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, wingH / 2, -0.08]} castShadow>
          <boxGeometry args={[fp * 0.26, wingH, fp * 0.42]} />
          {primaryMat}
        </mesh>
      ))}
      {/* Rooftop Penthouse Crown & Communications Spire */}
      <mesh position={[0, h + 0.14, -0.1]} castShadow>
        <boxGeometry args={[fp * 0.3, 0.28, fp * 0.3]} />
        {accentMat}
      </mesh>
      <mesh position={[0, h + 0.48, -0.1]}>
        <cylinderGeometry args={[0.02, 0.03, 0.48, 8]} />
        {glassMat}
      </mesh>
      {/* Courtyard Flagpole */}
      <mesh position={[0.55, 0.48, 0.72]}>
        <cylinderGeometry args={[0.02, 0.02, 0.95, 6]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
    </group>
  );
}

/* 4. Large-Scale Dams & Reservoirs — Concrete Gravity Dam, Spillway & Reservoir */
function DamArchetype({ fp, h, primaryMat, accentMat }) {
  const damH = Math.max(0.95, h * 0.85);
  return (
    <group>
      {/* Elevated Blue Water Reservoir Basin (Back Half) */}
      <mesh position={[0, damH * 0.42, -0.58]} castShadow>
        <boxGeometry args={[fp * 0.98, damH * 0.84, fp * 0.44]} />
        <meshStandardMaterial color="#0284c7" roughness={0.25} metalness={0.15} />
      </mesh>
      {/* Main Dam Wall with Sloped Downstream Face */}
      <mesh position={[0, damH / 2, 0.02]} castShadow>
        <boxGeometry args={[fp * 1.04, damH, 0.48]} />
        {primaryMat}
      </mesh>
      {/* Sloped Spillway Buttress & White Water Chutes */}
      <mesh position={[0, damH * 0.36, 0.32]} rotation={[0.38, 0, 0]} castShadow>
        <boxGeometry args={[fp * 0.68, damH * 0.78, 0.32]} />
        {accentMat}
      </mesh>
      {[-0.36, 0, 0.36].map((x) => (
        <mesh key={x} position={[x, damH * 0.38, 0.44]} rotation={[0.38, 0, 0]}>
          <boxGeometry args={[0.16, damH * 0.72, 0.06]} />
          <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={0.25} />
        </mesh>
      ))}
      {/* Hydroelectric Powerhouse & Stilling Basin at Dam Toe */}
      <mesh position={[0.45, 0.24, 0.68]} castShadow>
        <boxGeometry args={[0.68, 0.48, 0.44]} />
        {primaryMat}
      </mesh>
      <mesh position={[-0.35, 0.04, 0.75]}>
        <boxGeometry args={[1.1, 0.07, 0.55]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.3} />
      </mesh>
    </group>
  );
}

/* 5. Primary & Secondary Schools — U-Shaped Campus, Pitched Roofs, Clock Tower & Pitch */
function SchoolArchetype({ fp, h, primaryMat, accentMat }) {
  const wingH = Math.max(0.65, Math.min(2.2, h * 0.48));
  const towerH = Math.max(wingH + 0.5, h);
  return (
    <group>
      {/* Main Back Classroom Wing */}
      <mesh position={[0, wingH / 2, -0.58]} castShadow>
        <boxGeometry args={[fp * 0.96, wingH, 0.62]} />
        {primaryMat}
      </mesh>
      {/* Pitched Gable Roof on Main Wing */}
      <mesh position={[0, wingH + 0.2, -0.58]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[fp * 0.52, 0.42, 4]} />
        {accentMat}
      </mesh>
      {/* Left & Right Courtyard Classroom Wings */}
      {[-0.72, 0.72].map((x) => (
        <mesh key={x} position={[x, (wingH * 0.82) / 2, 0.15]} castShadow>
          <boxGeometry args={[0.56, wingH * 0.82, 1.15]} />
          {primaryMat}
        </mesh>
      ))}
      {/* School Bell / Clock Tower (Scales to Full Metric Height) */}
      <mesh position={[-0.72, towerH / 2, -0.58]} castShadow>
        <boxGeometry args={[0.52, towerH, 0.52]} />
        {primaryMat}
      </mesh>
      <mesh position={[-0.72, towerH + 0.24, -0.58]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.42, 0.48, 4]} />
        {accentMat}
      </mesh>
      {/* Clock Face */}
      <mesh position={[-0.72, towerH - 0.24, -0.31]}>
        <circleGeometry args={[0.13, 14]} />
        <meshStandardMaterial color="#fef08a" />
      </mesh>
      {/* Green Courtyard Sports Field */}
      <mesh position={[0, 0.03, 0.35]}>
        <boxGeometry args={[0.78, 0.05, 0.92]} />
        <meshStandardMaterial color="#16a34a" roughness={0.8} />
      </mesh>
    </group>
  );
}

/* 6. Polytechnic & Technical Schools — Sawtooth Workshop Bays & Engineering Lab Tower */
function PolytechnicArchetype({ fp, h, primaryMat, accentMat, glassMat }) {
  const hallH = Math.max(0.7, Math.min(2.1, h * 0.45));
  return (
    <group>
      {/* Technical Lab Tower (Right Side, Scales to Full Metric Height) */}
      <mesh position={[0.55, h / 2, -0.15]} castShadow>
        <boxGeometry args={[0.92, h, 1.45]} />
        {primaryMat}
      </mesh>
      {/* Rooftop Solar Panel Array on Tech Tower */}
      <mesh position={[0.55, h + 0.08, -0.15]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.72, 0.05, 0.95]} />
        {glassMat}
      </mesh>
      {/* Engineering Workshop Hall (Left Side) */}
      <mesh position={[-0.48, hallH / 2, 0.05]} castShadow>
        <boxGeometry args={[1.12, hallH, 1.75]} />
        {accentMat}
      </mesh>
      {/* 3-Bay Sawtooth Factory Roof Prisms */}
      {[-0.48, 0.05, 0.58].map((z) => (
        <mesh key={z} position={[-0.48, hallH + 0.16, z]} rotation={[0.35, 0, 0]} castShadow>
          <boxGeometry args={[1.08, 0.28, 0.44]} />
          {primaryMat}
        </mesh>
      ))}
    </group>
  );
}

/* 7. General & Tertiary Hospitals — H-Plan Medical Center, Helipad & Red Cross */
function HospitalArchetype({ fp, h, primaryMat, accentMat, glassMat }) {
  const wingH = Math.max(0.8, h * 0.68);
  return (
    <group>
      {/* Central High-Rise Medical Ward Spine */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[1.15, h, 0.72]} />
        {primaryMat}
      </mesh>
      {/* H-Plan Front & Rear Hospital Wings */}
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, wingH / 2, 0]} castShadow>
          <boxGeometry args={[0.55, wingH, fp * 0.85]} />
          {primaryMat}
        </mesh>
      ))}
      {/* Ground-Floor Emergency Ambulance Canopy */}
      <mesh position={[0, 0.25, 0.75]} castShadow>
        <boxGeometry args={[0.76, 0.1, 0.55]} />
        {glassMat}
      </mesh>
      {/* Prominent Medical Red Cross Emblem on Front Tower Facade */}
      <group position={[0, Math.max(0.65, h * 0.72), 0.38]}>
        <mesh>
          <boxGeometry args={[0.38, 0.12, 0.04]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.12, 0.38, 0.04]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
        </mesh>
      </group>
      {/* Rooftop Helipad Pad & Circle */}
      <mesh position={[0, h + 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.46, 0.08, 18]} />
        {accentMat}
      </mesh>
      <mesh position={[0, h + 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.34, 18]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
    </group>
  );
}

/* 8. Rural Health Centers — Pavilion Clinic, Veranda Roof, Water Tank Tower & Red Cross */
function ClinicArchetype({ fp, h, primaryMat, accentMat }) {
  const clinicH = Math.max(0.6, Math.min(1.6, h * 0.45));
  const tankH = Math.max(clinicH + 0.4, h * 0.88);
  return (
    <group>
      {/* Main Pavilion Clinic Building */}
      <mesh position={[-0.22, clinicH / 2, 0.1]} castShadow>
        <boxGeometry args={[1.45, clinicH, 1.15]} />
        {primaryMat}
      </mesh>
      {/* Overhanging Veranda Pitched Roof */}
      <mesh position={[-0.22, clinicH + 0.24, 0.1]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.15, 0.48, 4]} />
        {accentMat}
      </mesh>
      {/* Medical Cross Badge on Gable */}
      <group position={[-0.22, clinicH * 0.6, 0.69]}>
        <mesh>
          <boxGeometry args={[0.26, 0.08, 0.03]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
        <mesh>
          <boxGeometry args={[0.08, 0.26, 0.03]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
      </group>
      {/* Elevated Community Water Tank Tower (Scales with Metric Height) */}
      <group position={[0.75, 0, -0.55]}>
        <mesh position={[0, tankH / 2, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.22, tankH, 8]} />
          {accentMat}
        </mesh>
        <mesh position={[0, tankH + 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.45, 14]} />
          {primaryMat}
        </mesh>
      </group>
      <MiniTree position={[0.75, 0, 0.68]} scale={0.9} />
    </group>
  );
}

/* 9. Irrigation & Drainage Systems — Main Canal, Sluice Gate Control Tower & Pump House */
function IrrigationArchetype({ fp, h, primaryMat, accentMat }) {
  const gateH = Math.max(0.85, h * 0.82);
  return (
    <group>
      {/* Concrete Canal Banks */}
      {[-0.52, 0.52].map((x) => (
        <mesh key={x} position={[x, 0.12, 0]} castShadow>
          <boxGeometry args={[0.22, 0.24, fp * 1.08]} />
          {accentMat}
        </mesh>
      ))}
      {/* Glowing Blue Canal Water Channel */}
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[0.82, 0.14, fp * 1.08]} />
        <meshStandardMaterial color="#0ea5e9" roughness={0.2} metalness={0.15} />
      </mesh>
      {/* Overhead Radial Sluice Gate Bridge & Control Structure */}
      <mesh position={[-0.52, gateH / 2, -0.1]} castShadow>
        <boxGeometry args={[0.26, gateH, 0.42]} />
        {primaryMat}
      </mesh>
      <mesh position={[0.52, gateH / 2, -0.1]} castShadow>
        <boxGeometry args={[0.26, gateH, 0.42]} />
        {primaryMat}
      </mesh>
      <mesh position={[0, gateH + 0.14, -0.1]} castShadow>
        <boxGeometry args={[1.45, 0.28, 0.48]} />
        {primaryMat}
      </mesh>
      {/* Sluice Gate Panel */}
      <mesh position={[0, gateH * 0.45, -0.1]}>
        <boxGeometry args={[0.78, gateH * 0.65, 0.08]} />
        {accentMat}
      </mesh>
      {/* Irrigation Pumping Station House */}
      <mesh position={[0.88, 0.35, 0.45]} castShadow>
        <boxGeometry args={[0.52, 0.7, 0.75]} />
        {primaryMat}
      </mesh>
    </group>
  );
}

/* 10. Agricultural Research & Extension — Vaulted Polycarbonate Greenhouses & Agronomy Lab */
function AgriResearchArchetype({ fp, h, primaryMat, accentMat, glassMat }) {
  return (
    <group>
      {/* Agronomy Research Laboratory Tower (Scales to Full Metric Height) */}
      <mesh position={[0.62, h / 2, -0.45]} castShadow>
        <boxGeometry args={[0.88, h, 0.95]} />
        {primaryMat}
      </mesh>
      <mesh position={[0.62, h + 0.08, -0.45]} castShadow>
        <boxGeometry args={[0.72, 0.14, 0.76]} />
        {accentMat}
      </mesh>
      {/* Pair of Arched Translucent Greenhouses */}
      {[-0.58, 0.02].map((x, idx) => (
        <group key={x} position={[x, 0, 0.22 + idx * 0.1]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[0.48, 0.4, 1.35]} />
            {glassMat}
          </mesh>
          <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.24, 1.35, 12, 1, false, 0, Math.PI]} />
            {glassMat}
          </mesh>
        </group>
      ))}
      {/* Striped Experimental Crop Rows */}
      {[0.4, 0.62, 0.84].map((x, i) => (
        <mesh key={x} position={[x, 0.04, 0.55]}>
          <boxGeometry args={[0.14, 0.07, 0.85]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#22c55e" : "#eab308"} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/* 11. Livestock & Veterinary Services — Gambrel Barn, Twin Silos & Paddock Corral */
function LivestockArchetype({ fp, h, primaryMat, accentMat }) {
  const barnH = Math.max(0.65, Math.min(1.8, h * 0.45));
  const siloH = Math.max(1.0, h * 0.92);
  return (
    <group>
      {/* Main Livestock Barn */}
      <mesh position={[-0.35, barnH / 2, -0.15]} castShadow>
        <boxGeometry args={[1.15, barnH, 1.45]} />
        {primaryMat}
      </mesh>
      {/* Gambrel Pitched Roof */}
      <mesh position={[-0.35, barnH + 0.28, -0.15]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.92, 0.56, 4]} />
        {accentMat}
      </mesh>
      {/* Twin Cylindrical Feed Silos with Hemispherical Dome Caps (Scales to Metric Height) */}
      {[-0.55, 0.12].map((z, idx) => {
        const sh = idx === 0 ? siloH : siloH * 0.78;
        return (
          <group key={z} position={[0.58, 0, z]}>
            <mesh position={[0, sh / 2, 0]} castShadow>
              <cylinderGeometry args={[0.28, 0.28, sh, 16]} />
              {primaryMat}
            </mesh>
            <mesh position={[0, sh, 0]} castShadow>
              <sphereGeometry args={[0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              {accentMat}
            </mesh>
          </group>
        );
      })}
      {/* Veterinary Paddock Fence Corral */}
      <mesh position={[0.45, 0.12, 0.72]}>
        <boxGeometry args={[0.95, 0.22, 0.06]} />
        {accentMat}
      </mesh>
    </group>
  );
}

/* 12. Forestry & Watershed Development — Terraced Forest Mound, Retention Pond & Watchtower */
function ForestryArchetype({ fp, h, primaryMat, accentMat }) {
  const towerH = Math.max(1.1, h * 0.95);
  return (
    <group>
      {/* Terraced Earth Watershed Mound */}
      <mesh position={[-0.15, 0.14, -0.12]} castShadow>
        <cylinderGeometry args={[0.95, 1.18, 0.28, 12]} />
        <meshStandardMaterial color="#3f6212" roughness={0.92} />
      </mesh>
      {/* Blue Watershed Retention Pond */}
      <mesh position={[0.58, 0.04, 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.48, 14]} />
        <meshStandardMaterial color="#0284c7" roughness={0.25} />
      </mesh>
      {/* Forestry Fire-Watch Lookout Tower (Scales to Full Metric Height) */}
      <group position={[0.55, 0, -0.52]}>
        <mesh position={[0, towerH / 2, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.26, towerH, 4]} />
          {accentMat}
        </mesh>
        {/* Observation Cabin at Top */}
        <mesh position={[0, towerH + 0.16, 0]} castShadow>
          <boxGeometry args={[0.48, 0.32, 0.48]} />
          {primaryMat}
        </mesh>
        <mesh position={[0, towerH + 0.42, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[0.42, 0.24, 4]} />
          {accentMat}
        </mesh>
      </group>
      {/* Dense Multi-Layered Forest Cluster */}
      <MiniTree position={[-0.55, 0.22, -0.45]} scale={1.25} />
      <MiniTree position={[-0.1, 0.24, -0.52]} scale={1.1} />
      <MiniTree position={[-0.62, 0.22, 0.25]} scale={1.05} />
      <MiniTree position={[-0.12, 0.22, 0.28]} scale={1.18} />
      <MiniTree position={[-0.45, 0.0, 0.75]} scale={0.95} />
    </group>
  );
}

/* ---- Master Archetype Switcher ---- */
function ArchetypeModel({ archetype, fp, height, color, state, progress, emissiveIntensity }) {
  const isAvail = state === "available";
  const isPending = state === "pending";
  const isActive = state === "active";
  const isSuspended = state === "suspended";
  const isCompleted = state === "completed";

  // Active & suspended projects scale vertically with construction progress (38% base to 100%)
  const buildFactor = isPending
    ? 0.18
    : isActive || isSuspended
    ? 0.38 + 0.62 * Math.max(0, Math.min(1, progress ?? 0.5))
    : 1.0;

  const effectiveH = Math.max(0.25, height * buildFactor);

  const primaryMat = (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={emissiveIntensity}
      roughness={isCompleted ? 0.55 : 0.72}
      metalness={isCompleted ? 0.12 : 0.05}
      transparent={isAvail || isPending}
      opacity={isAvail ? 0.78 : isPending ? 0.55 : 1}
    />
  );

  const accentMat = (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={emissiveIntensity * 0.5}
      roughness={0.82}
      metalness={0.08}
      transparent={isAvail || isPending}
      opacity={isAvail ? 0.65 : isPending ? 0.5 : 1}
    />
  );

  const glassMat = (
    <meshStandardMaterial
      color={isCompleted ? "#bae6fd" : "#93c5fd"}
      emissive={isCompleted ? "#38bdf8" : "#1e3a8a"}
      emissiveIntensity={isCompleted ? 0.35 : 0.12}
      roughness={0.2}
      metalness={0.5}
      transparent
      opacity={isAvail ? 0.45 : 0.85}
    />
  );

  const darkMat = (
    <meshStandardMaterial
      color="#334155"
      roughness={0.85}
      transparent={isAvail}
      opacity={isAvail ? 0.7 : 1}
    />
  );

  const props = { fp, h: effectiveH, primaryMat, accentMat, glassMat, darkMat };

  let model;
  switch (archetype) {
    case "highway":       model = <HighwayArchetype {...props} />; break;
    case "rural_road":    model = <RuralRoadArchetype {...props} />; break;
    case "civic_complex": model = <CivicComplexArchetype {...props} />; break;
    case "dam":           model = <DamArchetype {...props} />; break;
    case "school":        model = <SchoolArchetype {...props} />; break;
    case "polytechnic":   model = <PolytechnicArchetype {...props} />; break;
    case "hospital":      model = <HospitalArchetype {...props} />; break;
    case "clinic":        model = <ClinicArchetype {...props} />; break;
    case "irrigation":    model = <IrrigationArchetype {...props} />; break;
    case "agri_research": model = <AgriResearchArchetype {...props} />; break;
    case "livestock":     model = <LivestockArchetype {...props} />; break;
    case "forestry":      model = <ForestryArchetype {...props} />; break;
    default:              model = <CivicComplexArchetype {...props} />; break;
  }

  return (
    <group>
      {model}

      {/* Wireframe target-height scaffolding / blueprint cage for Available or Active projects */}
      {(isAvail || isActive || isPending) && (
        <mesh position={[0, height / 2, 0]}>
          <boxGeometry args={[fp * 0.92, height, fp * 0.92]} />
          <meshBasicMaterial
            color={isAvail ? "#94a3b8" : color}
            wireframe
            transparent
            opacity={isAvail ? 0.22 : 0.28}
          />
        </mesh>
      )}

      {/* Animated Construction Tower Crane for Active & Suspended Projects */}
      {(isActive || isSuspended) && (
        <ConstructionCrane height={height} active={isActive} suspended={isSuspended} fp={fp} />
      )}

      {/* Corner Landscaping Trees on Completed Plots (for urban/building archetypes) */}
      {isCompleted && archetype !== "forestry" && archetype !== "dam" && (
        <>
          <MiniTree position={[-fp * 0.56, 0, fp * 0.56]} scale={0.75} />
          <MiniTree position={[fp * 0.56, 0, fp * 0.56]} scale={0.75} />
        </>
      )}
    </group>
  );
}

export default function Building({
  building,      // { id, category, subCategory, x, z }
  project,       // full live project object
  height,        // resolved world height for the active metric
  color,         // status colour
  padColor,      // plot pad colour (scene chrome)
  accent,        // selection ring colour
  addable,       // true → project can be added right now (gold highlighted base)
  addColor,      // gold highlight colour
  selected,
  focused,       // cross-highlighted from Left Pane
  onSelect,      // (id) => void
  onHover,       // (id | null) => void
}) {
  const [hovered, setHovered] = useState(false);
  const shape = shapeForProject(project || building, building.subCategory);
  const fp = shape.footprint || 2.3;

  const state = project?.state || "available";
  const progress =
    project && project.bacCurrent > 0
      ? Math.min(1, (project.nominalSpent || 0) / project.bacCurrent)
      : 0;

  const isHighlighted = selected || focused;
  const emissiveIntensity = isHighlighted ? 0.55 : hovered ? 0.34 : 0.08;

  return (
    <group position={[building.x, 0, building.z]}>
      {/* plot pad — gold + glowing when the project can be added right now */}
      <mesh position={[0, addable ? 0.09 : 0.06, 0]} receiveShadow>
        <boxGeometry args={[fp * (addable ? 1.48 : 1.32), addable ? 0.18 : 0.12, fp * (addable ? 1.48 : 1.32)]} />
        <meshStandardMaterial
          color={addable ? addColor : state === "completed" ? "#064e3b" : padColor}
          emissive={addable ? addColor : state === "completed" ? "#059669" : "#000000"}
          emissiveIntensity={addable ? 0.55 : state === "completed" ? 0.18 : 0}
          roughness={addable ? 0.5 : 0.92}
          metalness={0}
        />
      </mesh>

      {/* selection / cross-highlight ring */}
      {isHighlighted && (
        <mesh position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[fp * 0.88, 0.075, 10, 32]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.95} roughness={0.35} />
        </mesh>
      )}

      {/* ARC Reduced Maintenance Warning Beacon on Completed Projects */}
      {state === "completed" && project?.arcReduced && (
        <mesh position={[0, height + 0.65, 0]}>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color="#c084fc" emissive="#9333ea" emissiveIntensity={0.9} />
        </mesh>
      )}

      {/* 3D Architectural Archetype */}
      <group
        position={[0, 0.12, 0]}
        onClick={(e) => { e.stopPropagation(); onSelect(building.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(building.id); document.body.style.cursor = "pointer"; }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); onHover(null); document.body.style.cursor = "auto"; }}
      >
        <ArchetypeModel
          archetype={shape.archetype}
          fp={fp}
          height={Math.max(height, 0.25)}
          color={color}
          state={state}
          progress={progress}
          emissiveIntensity={emissiveIntensity}
        />
      </group>
    </group>
  );
}
