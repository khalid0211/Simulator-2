/* ============================================================
   Development Map — palette, height metrics, scene chrome
   Pure data + pure functions.
   ============================================================ */

export const STATE_COLORS = {
  available: "#5B6472", // slate grey  — in the pool, not yet selected
  pending:   "#8A6FE8", // violet      — approved, waiting out the approval lag
  active:    "#2563EB", // blue        — drawing funds on its S-curve
  suspended: "#D97706", // amber       — paused
  completed: "#059669", // green       — delivered
  abandoned: "#D1483F", // red         — cancelled
  expired:   "#7A6A57", // brown       — unfinished at Month 60
};

export const STATE_ORDER = [
  "available", "pending", "active", "suspended", "completed", "abandoned", "expired",
];

export const STATE_LABELS = {
  available: "Available",
  pending:   "Pending",
  active:    "Active",
  suspended: "Suspended",
  completed: "Completed",
  abandoned: "Abandoned",
  expired:   "Expired",
};

export const stateColor = (state) => STATE_COLORS[state] || STATE_COLORS.available;

export const ADD_HIGHLIGHT = "#EAB308";

export function isAddable(p, sim) {
  if (!p || p.state !== "available") return false;
  const cap = sim.config?.concurrentCap || 0;
  if (cap > 0) {
    const live = sim.projects.filter((x) => x.state === "active" || x.state === "pending").length;
    if (live >= cap) return false;
  }
  const bac = p.bacInitial * Math.pow(1 + sim.monthlyRate, sim.month);
  return bac <= sim.availableBalance + 1e-9;
}

const bacOf = (p) => p.bacCurrent || p.bacInitial || 0;

export const HEIGHT_METRICS = [
  { key: "bac",      label: "Budget (BAC)",   unit: "$M",    accessor: (p) => bacOf(p) },
  { key: "arc",      label: "ARC / month",    unit: "$M",    accessor: (p) => bacOf(p) * (p.arcRate || 0) / 12 },
  { key: "bu",       label: "Benefit Units",  unit: "BU/mo", accessor: (p) => p.buRate || 0 },
  { key: "duration", label: "Duration",       unit: "mo",    accessor: (p) => p.durationCurrent || p.durationPlanned || 0 },
];

export const DEFAULT_METRIC = "bac";

export const metricByKey = (key) =>
  HEIGHT_METRICS.find((m) => m.key === key) || HEIGHT_METRICS[0];

export const FLAT_HEIGHT = 0.2;
export const MIN_HEIGHT = 1.0;
export const MAX_HEIGHT = 8.0;

export function makeHeightScale(metricKey, projects) {
  const { accessor } = metricByKey(metricKey);
  let max = 0;
  for (const p of projects) {
    const v = accessor(p);
    if (v > max) max = v;
  }
  return (p) => {
    if (max <= 0) return FLAT_HEIGHT;
    const v = accessor(p);
    if (v <= 0) return FLAT_HEIGHT;
    return MIN_HEIGHT + (v / max) * (MAX_HEIGHT - MIN_HEIGHT);
  };
}

export function riskLevel(p) {
  const combined = (p.costRisk || 0) + (p.durRisk || 0);
  if (combined < 0.20) return "low";
  if (combined <= 0.30) return "medium";
  return "high";
}

export const SCENE_CHROME = {
  light: {
    background: "#eef2f8",
    ground:     "#dbe3ef",
    grid:       "#c2ccdb",
    ambient:    0.88,
    directional: 0.85,
    hudText:    "#16202e",
    hudMuted:   "#566379",
  },
  dark: {
    background: "#0a1019",
    ground:     "#0e1626",
    grid:       "#21304a",
    ambient:    0.6,
    directional: 0.95,
    hudText:    "#e6edf7",
    hudMuted:   "#8da3c0",
  },
};

export const sceneChrome = (theme) => SCENE_CHROME[theme] || SCENE_CHROME.light;
