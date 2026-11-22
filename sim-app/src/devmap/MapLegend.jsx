/* ============================================================
   Development Map — HUD overlay: height-metric switcher + legends
   ============================================================ */

import React from "react";
import { HEIGHT_METRICS, STATE_ORDER, STATE_COLORS, STATE_LABELS, ADD_HIGHLIGHT } from "./mapPalette.js";
import { DISTRICT_TINTS } from "./cityLayout.js";

const DISTRICT_LEGEND = [
  ["Physical Infrastructure & Transport", "Infrastructure", "Viaducts · Bridges · Civic · Dams"],
  ["Social Sectors (Education & Health)", "Social", "Schools · Polytechnics · Hospitals · Clinics"],
  ["Agriculture, Irrigation & Resources", "Agriculture", "Canals · Greenhouses · Barns/Silos · Forestry"],
];

export default function MapLegend({ metric, setMetric, chrome }) {
  const bar = {
    background: chrome.background + "e8",
    border: `1px solid ${chrome.grid}`,
    borderRadius: 10,
    color: chrome.hudText,
    fontSize: 11.5,
    boxShadow: "0 6px 20px #0003",
    backdropFilter: "blur(4px)",
    pointerEvents: "auto",
  };
  const swatch = (bg, radius = 3) => ({ width: 11, height: 11, borderRadius: radius, background: bg, flexShrink: 0 });
  const item = { display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };

  return (
    <>
      {/* Height-metric switcher — top centre */}
      <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", ...bar, display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 12px" }}>
        <span style={{ color: chrome.hudMuted, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 10, fontWeight: 700 }}>Height</span>
        <div style={{ display: "flex", gap: 4 }}>
          {HEIGHT_METRICS.map((m) => {
            const on = metric === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                title={`Scale 3D structures by ${m.label}`}
                style={{
                  padding: "5px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                  whiteSpace: "nowrap",
                  borderRadius: 6, border: `1px solid ${on ? chrome.hudText : chrome.grid}`,
                  background: on ? chrome.hudText : "transparent",
                  color: on ? chrome.background : chrome.hudMuted,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status + 12-Archetype District legends — centred at the bottom */}
      <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, display: "flex", alignItems: "flex-end", justifyContent: "center", flexWrap: "wrap", gap: 12, fontSize: 10.5, pointerEvents: "none" }}>
        {/* Status panel — 4 across */}
        <div style={{ ...bar, display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "4px 14px", padding: "8px 14px" }}>
          {STATE_ORDER.map((s) => (
            <span key={s} style={item}>
              <span style={swatch(STATE_COLORS[s], 3)} />
              {STATE_LABELS[s]}
            </span>
          ))}
          <span style={item}>
            <span style={{ ...swatch(ADD_HIGHLIGHT, 3), boxShadow: `0 0 5px ${ADD_HIGHLIGHT}` }} />
            Affordable now
          </span>
        </div>

        {/* 12-Archetype Districts panel */}
        <div style={{ ...bar, display: "flex", flexDirection: "column", gap: 3, padding: "7px 14px", color: chrome.hudMuted }}>
          {DISTRICT_LEGEND.map(([catKey, shortName, archetypes]) => (
            <span key={catKey} style={item}>
              <span style={swatch(DISTRICT_TINTS[catKey], 2)} />
              <strong style={{ color: chrome.hudText }}>{shortName}:</strong> {archetypes}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
