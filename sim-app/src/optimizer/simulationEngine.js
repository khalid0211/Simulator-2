/* ============================================================
   PURE SIMULATION ENGINE & MULTI-OBJECTIVE EVALUATOR
   Shared between the React UI and the AI Optimizer Web Worker.
   100% deterministic for any given seed and action sequence.
   ============================================================ */

export const ARC_CATEGORIES = [
  { category: "Physical Infrastructure & Transport",     subCategory: "Paved Roads & Highways",             arcRate: 0.0500 },
  { category: "Physical Infrastructure & Transport",     subCategory: "Feeder & Rural Roads",               arcRate: 0.1000 },
  { category: "Physical Infrastructure & Transport",     subCategory: "Buildings (Administrative)",         arcRate: 0.0200 },
  { category: "Physical Infrastructure & Transport",     subCategory: "Large-Scale Dams & Reservoirs",       arcRate: 0.0150 },
  { category: "Social Sectors (Education & Health)",     subCategory: "Primary & Secondary Schools",        arcRate: 0.1950 },
  { category: "Social Sectors (Education & Health)",     subCategory: "Polytechnic & Technical Schools",    arcRate: 0.2100 },
  { category: "Social Sectors (Education & Health)",     subCategory: "General & Tertiary Hospitals",       arcRate: 0.2700 },
  { category: "Social Sectors (Education & Health)",     subCategory: "Rural Health Centers",               arcRate: 0.4900 },
  { category: "Agriculture, Irrigation & Resources",     subCategory: "Irrigation & Drainage Systems",      arcRate: 0.0300 },
  { category: "Agriculture, Irrigation & Resources",     subCategory: "Agricultural Research & Extension",  arcRate: 0.0475 },
  { category: "Agriculture, Irrigation & Resources",     subCategory: "Livestock & Veterinary Services",     arcRate: 0.1050 },
  { category: "Agriculture, Irrigation & Resources",     subCategory: "Forestry & Watershed Development",    arcRate: 0.0250 },
];

export const BU_INTENSITY = {
  "Paved Roads & Highways":            0.8,
  "Feeder & Rural Roads":              1.0,
  "Buildings (Administrative)":        0.3,
  "Large-Scale Dams & Reservoirs":     0.6,
  "Primary & Secondary Schools":       1.6,
  "Polytechnic & Technical Schools":   1.4,
  "General & Tertiary Hospitals":      2.0,
  "Rural Health Centers":              1.8,
  "Irrigation & Drainage Systems":     1.1,
  "Agricultural Research & Extension": 0.9,
  "Livestock & Veterinary Services":   0.9,
  "Forestry & Watershed Development":  0.7,
};

export function computeDefaultBuRate(bacInitial, subCategory, costRisk, durRisk) {
  const intensity = BU_INTENSITY[subCategory] || 1.0;
  return +(bacInitial * intensity * (1 + (costRisk || 0) + (durRisk || 0))).toFixed(2);
}

export const betaCDF = (x) => 3 * x * x - 2 * x * x * x; // a=b=2

export function generateSCurve(budget, duration) {
  const d = Math.max(1, Math.round(duration));
  const c = [];
  for (let t = 1; t <= d; t++) c.push(budget * (betaCDF(t / d) - betaCDF((t - 1) / d)));
  return c;
}

export const inflator = (rate, n) => Math.pow(1 + rate, n);
export const CRASH_K = 0.5;
export const BU_VALUE = 0.02;

export function mkRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function monthRngFor(seed, month) {
  return mkRng(((seed >>> 0) + month * 2654435761) >>> 0);
}

/**
 * Fast FNV-1a 32-bit string hash for deterministic scenario seeds and scenario keys.
 */
export function hashString32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 123456789;
}

/**
 * Derives a deterministic default seed for a given scenario configuration so that
 * playing the same scenario settings (and scenario variation #) visits the same scenario
 * and reuses the stored optimal benchmark on subsequent runs.
 */
export function computeDefaultScenarioSeed(cfg = {}) {
  const sig = [
    cfg.preset || "standard",
    cfg.customPortfolioId || "procedural",
    Number(cfg.annualRate ?? 0.03).toFixed(4),
    cfg.fundingProfile || "scurve",
    Number(cfg.fundingFrequency ?? 3),
    Number(cfg.budgetTightness ?? 1.5).toFixed(2),
    cfg.customTotalBudget != null ? Number(cfg.customTotalBudget).toFixed(2) : "auto",
    Number(cfg.politicalProjects ?? 0),
    Number(cfg.concurrentCap ?? 0),
    Number(cfg.approvalLag ?? 0),
    Number(cfg.riskMultiplier ?? 1.0).toFixed(2),
    cfg.arcEnabled ? "arc1" : "arc0",
    cfg.benefitsEnabled ? "ben1" : "ben0",
    cfg.partialCreditEnabled ? "pc1" : "pc0",
    `var${cfg.scenarioVariant || 1}`,
  ].join("|");
  return hashString32(sig) % 900000000 + 10000000;
}

/**
 * Computes a unique, deterministic fingerprint (`scenarioKey`) for a simulation scenario
 * combining its seed, configuration parameters, total budget, and baseline project pool.
 */
export function computeScenarioKey(sim) {
  if (!sim) return "unknown";
  const c = sim.config || {};
  const projFp = (sim.projects || [])
    .map(
      (p) =>
        `${p.id}:${Number(p.bacInitial).toFixed(1)}:${Number(p.alignment).toFixed(2)}:${p.durationPlanned}:${Number(p.arcRate || 0).toFixed(3)}:${p.political ? 1 : 0}`
    )
    .join(",");
  const projHash = hashString32(projFp).toString(36);
  const cfgParts = [
    `s${sim.seed}`,
    `b${Number(sim.totalBudget || 0).toFixed(1)}`,
    `r${Number(sim.annualRate || 0).toFixed(3)}`,
    `fp-${c.fundingProfile || "scurve"}`,
    `fq${c.fundingFrequency ?? 3}`,
    `pol${c.politicalProjects ?? 0}`,
    `cap${c.concurrentCap ?? 0}`,
    `lag${c.approvalLag ?? 0}`,
    `rm${Number(c.riskMultiplier ?? 1).toFixed(1)}`,
    `arc${c.arcEnabled ? 1 : 0}`,
    `ben${c.benefitsEnabled ? 1 : 0}`,
    `pc${c.partialCreditEnabled ? 1 : 0}`,
    `p-${projHash}`,
  ];
  return "scen_" + cfgParts.join("_");
}

const TITLE_A = ["Digital", "Integrated", "Provincial", "Regional", "Smart", "Unified", "Rural", "Urban", "National", "Coastal", "Metro", "Strategic"];

const CATEGORY_TITLE_WORDS = {
  "Paved Roads & Highways":            ["Highway Corridor", "Paved Road Network", "Arterial Road Upgrade"],
  "Feeder & Rural Roads":              ["Feeder Road Programme", "Rural Access Roads", "Farm-to-Market Road Link"],
  "Buildings (Administrative)":        ["Administrative Complex", "Government Office Building", "Civic Centre"],
  "Large-Scale Dams & Reservoirs":     ["Dam & Reservoir Scheme", "Multipurpose Dam Project", "Water Storage Reservoir"],
  "Primary & Secondary Schools":       ["Schools Rehabilitation Programme", "Primary Schools Expansion", "Secondary Education Campus"],
  "Polytechnic & Technical Schools":   ["Polytechnic Institute", "Technical Training College", "Vocational Skills Campus"],
  "General & Tertiary Hospitals":      ["General Hospital", "Tertiary Care Hospital", "Medical Centre Upgrade"],
  "Rural Health Centers":              ["Rural Health Centre Network", "Basic Health Unit Programme", "Community Clinic Scheme"],
  "Irrigation & Drainage Systems":     ["Irrigation & Drainage Scheme", "Canal Irrigation Upgrade", "Drainage Improvement Project"],
  "Agricultural Research & Extension": ["Agricultural Research Station", "Extension Services Programme", "Crop Research Centre"],
  "Livestock & Veterinary Services":   ["Livestock Development Programme", "Veterinary Services Centre", "Animal Health Station"],
  "Forestry & Watershed Development":  ["Forestry & Watershed Programme", "Afforestation Scheme", "Watershed Management Project"],
};

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignCategories(rng) {
  const slots = [];
  while (slots.length < 30) slots.push(...shuffle(ARC_CATEGORIES, rng));
  return shuffle(slots.slice(0, 30), rng);
}

export function genProjects(rng) {
  const categorySlots = assignCategories(rng);
  const usedTitles = new Set();
  const ps = [];
  for (let i = 0; i < 30; i++) {
    const { category, subCategory, arcRate } = categorySlots[i];
    const words = CATEGORY_TITLE_WORDS[subCategory];
    let title;
    do { title = `${TITLE_A[Math.floor(rng() * TITLE_A.length)]} ${words[Math.floor(rng() * words.length)]}`; }
    while (usedTitles.has(title) && usedTitles.size < TITLE_A.length * words.length);
    usedTitles.add(title);
    const costRiskBase = +(0.05 + rng() * 0.15).toFixed(3);
    const durRiskBase = +(0.05 + rng() * 0.15).toFixed(3);
    ps.push({
      id: "P" + String(i + 1).padStart(2, "0"),
      title,
      category, subCategory, arcRate,
      bacInitial: +(2 + rng() * 13).toFixed(2),
      alignment: +(0.20 + rng() * 0.80).toFixed(2),
      durationPlanned: 12 + Math.floor(rng() * 25),
      costRiskBase,
      durRiskBase,
      costRisk: costRiskBase,
      durRisk: durRiskBase,
      state: "available",
      startMonth: null, completionMonth: null,
      bacCurrent: 0, nominalSpent: 0, cashDrawn: 0,
      durationCurrent: null,
      sCurve: [], sCurveBaseline: [],
      milestones: [],
      suspendPenalty: 0,
      arcBaseBac: 0,
      arcReduced: false,
      arcBacklog: 0,
      arcReductionCount: 0,
      arcCutoff: false,
      buRate: 0,
      buCumulative: 0,
    });
  }
  return ps;
}

export function maxCompletions(projects, totalBudget) {
  const sorted = projects.map((p) => p.bacInitial).sort((a, b) => a - b);
  let cum = 0, c = 0;
  for (const b of sorted) { if (cum + b <= totalBudget) { cum += b; c++; } else break; }
  return Math.max(1, c);
}

export function computeReleaseSchedule(totalBudget, profile, rng2, N = 20) {
  const norm = (w) => { const s = w.reduce((a, b) => a + b, 0); return w.map((v) => +(v * totalBudget / s).toFixed(4)); };
  if (profile === "scurve") {
    const w = Array.from({ length: N }, (_, i) => betaCDF((i + 1) / N) - betaCDF(i / N));
    return norm(w);
  }
  if (profile === "frontloaded") return norm(Array.from({ length: N }, (_, i) => N - i));
  if (profile === "backloaded")  return norm(Array.from({ length: N }, (_, i) => i + 1));
  if (profile === "volatile") {
    const w = Array.from({ length: N }, () => 0.8 + rng2() * 0.4);
    return norm(w);
  }
  return Array(N).fill(+(totalBudget / N).toFixed(4));
}

export function hydrateCustomProjects(templates, riskMultiplier) {
  return templates.slice(0, 50).map((t, i) => {
    const costRiskBase = t.costRiskBase ?? t.costRisk ?? 0.1;
    const durRiskBase = t.durRiskBase ?? t.durRisk ?? 0.1;
    const costRisk = Math.min(0.40, +(costRiskBase * riskMultiplier).toFixed(3));
    const durRisk = Math.min(0.40, +(durRiskBase * riskMultiplier).toFixed(3));
    const bacInitial = +Number(t.bacInitial || 5).toFixed(2);
    const subCategory = t.subCategory || "Buildings (Administrative)";
    const catMatch = ARC_CATEGORIES.find((c) => c.subCategory === subCategory) || ARC_CATEGORIES[2];
    const buRate =
      t.buRate && t.buRate > 0
        ? +Number(t.buRate).toFixed(2)
        : computeDefaultBuRate(bacInitial, catMatch.subCategory, costRisk, durRisk);
    return {
      id: "P" + String(i + 1).padStart(2, "0"),
      title: String(t.title || `Project P${i + 1}`),
      category: catMatch.category,
      subCategory: catMatch.subCategory,
      arcRate: t.arcRate != null ? +Number(t.arcRate).toFixed(4) : catMatch.arcRate,
      bacInitial,
      alignment: Math.min(1, Math.max(0.01, +Number(t.alignment ?? 0.5).toFixed(2))),
      durationPlanned: Math.min(60, Math.max(1, Math.round(t.durationPlanned || 18))),
      costRiskBase,
      durRiskBase,
      costRisk,
      durRisk,
      state: "available",
      startMonth: null,
      completionMonth: null,
      bacCurrent: 0,
      nominalSpent: 0,
      cashDrawn: 0,
      durationCurrent: null,
      sCurve: [],
      sCurveBaseline: [],
      milestones: [],
      suspendPenalty: 0,
      arcBaseBac: 0,
      arcReduced: false,
      arcBacklog: 0,
      arcReductionCount: 0,
      arcCutoff: false,
      buRate,
      buCumulative: 0,
      politicalPreFlagged: Boolean(t.political),
    };
  });
}

export function newSim(cfg) {
  const {
    name = "Untitled run",
    playerName = "Anonymous",
    preset = "custom",
    annualRate = 0.03,
    fundingProfile = "flat",
    budgetTightness = 1.5,
    customTotalBudget = null,
    customPortfolioId = null,
    customPortfolioName = null,
    customProjects = null,
    politicalProjects = 0,
    concurrentCap = 0,
    approvalLag = 0,
    riskMultiplier = 1.0,
    blindAlignment = false,
    blindScore = false,
    fundingFrequency = 3,
    arcEnabled = true,
    benefitsEnabled = false,
    partialCreditEnabled = false,
    explicitSeed = null,
    goalRanking = null,
    scenarioVariant = 1,
  } = cfg;
  const seed =
    explicitSeed != null
      ? explicitSeed >>> 0
      : computeDefaultScenarioSeed({
          preset,
          customPortfolioId,
          annualRate,
          fundingProfile,
          fundingFrequency,
          budgetTightness,
          customTotalBudget,
          politicalProjects,
          concurrentCap,
          approvalLag,
          riskMultiplier,
          arcEnabled,
          benefitsEnabled,
          partialCreditEnabled,
          scenarioVariant,
        });
  const rng = mkRng(seed);

  let projects;
  if (Array.isArray(customProjects) && customProjects.length > 0) {
    projects = hydrateCustomProjects(customProjects, riskMultiplier);
  } else {
    projects = genProjects(rng);
    projects.forEach((p) => {
      p.costRisk = Math.min(0.40, +(p.costRiskBase * riskMultiplier).toFixed(3));
      p.durRisk  = Math.min(0.40, +(p.durRiskBase  * riskMultiplier).toFixed(3));
      p.buRate = +(p.bacInitial * (BU_INTENSITY[p.subCategory] || 1) * (1 + p.costRisk + p.durRisk)).toFixed(2);
    });
  }

  const sumBac = projects.reduce((a, p) => a + p.bacInitial, 0);
  const totalBudget =
    customTotalBudget != null && Number(customTotalBudget) > 0
      ? +Number(customTotalBudget).toFixed(2)
      : +(sumBac / budgetTightness).toFixed(2);

  const N = Math.round(60 / fundingFrequency);
  const releaseSchedule = computeReleaseSchedule(totalBudget, fundingProfile, rng, N);
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

  const activateAsPolitical = (p) => {
    const bac = +(p.bacInitial).toFixed(4);
    p.bacCurrent = bac;
    p.sCurve = generateSCurve(bac, p.durationPlanned);
    p.sCurveBaseline = p.sCurve.slice();
    p.state = "active";
    p.startMonth = 1;
    p.durationCurrent = p.durationPlanned;
    p.political = true;
    p.lockUntil = 24;
  };

  const preFlagged = projects.filter((p) => p.politicalPreFlagged);
  preFlagged.forEach(activateAsPolitical);

  const remainingNeeded = Math.max(0, politicalProjects - preFlagged.length);
  if (remainingNeeded > 0) {
    const unflagged = projects.filter((p) => !p.political).sort((a, b) => a.alignment - b.alignment);
    unflagged.slice(0, remainingNeeded).forEach(activateAsPolitical);
  }

  const sim = {
    name, seed,
    playerName,
    month: 1,
    annualRate, monthlyRate,
    totalBudget,
    releaseSchedule,
    quarterlyRelease: releaseSchedule[0],
    released: releaseSchedule[0],
    availableBalance: releaseSchedule[0],
    maxComp: maxCompletions(projects, totalBudget),
    projects,
    events: [], decisions: [], alerts: [], history: [],
    status: "running",
    startedAt: Date.now(),
    config: {
      fundingProfile, fundingFrequency, budgetTightness,
      customTotalBudget: customTotalBudget != null && Number(customTotalBudget) > 0 ? +Number(customTotalBudget).toFixed(2) : null,
      customPortfolioId, customPortfolioName,
      politicalProjects, concurrentCap, approvalLag, riskMultiplier,
      blindAlignment, blindScore, preset, arcEnabled, benefitsEnabled, partialCreditEnabled,
      goalRanking: goalRanking || null,
      scenarioVariant,
    },
  };
  sim.scenarioKey = computeScenarioKey(sim);
  return sim;
}

export function clone(sim) {
  return {
    ...sim,
    releaseSchedule: sim.releaseSchedule ? sim.releaseSchedule.slice() : [],
    projects: sim.projects.map((p) => ({
      ...p,
      sCurve: p.sCurve ? p.sCurve.slice() : [],
      sCurveBaseline: p.sCurveBaseline ? p.sCurveBaseline.slice() : [],
      milestones: p.milestones ? p.milestones.slice() : [],
      drawHistory: p.drawHistory ? p.drawHistory.slice() : undefined,
    })),
    events: sim.events ? sim.events.slice() : [],
    decisions: sim.decisions ? sim.decisions.slice() : [],
    alerts: sim.alerts ? sim.alerts.slice() : [],
    history: sim.history ? sim.history.slice() : [],
    config: sim.config ? { ...sim.config } : {},
  };
}
export const actives = (sim) => sim.projects.filter((p) => p.state === "active");

export function demandAt(sim, month) {
  return actives(sim).reduce((a, p) => a + (p.sCurve[0] || 0) * inflator(sim.monthlyRate, month), 0);
}

/* ---- Annual Recurring Cost (ARC) ---- */
export function arcFullMonthlyFor(p, month, annualRate) {
  if (!p.arcRate || !p.completionMonth || month <= p.completionMonth) return 0;
  const elapsed = month - p.completionMonth;
  const yearIdx = Math.floor((elapsed - 1) / 12);
  return (p.arcBaseBac * p.arcRate / 12) * Math.pow(1 + annualRate, yearIdx);
}

export function arcMonthlyFor(p, month, annualRate) {
  const full = arcFullMonthlyFor(p, month, annualRate);
  return p.arcReduced ? full * 0.7 : full;
}

export function arcDemandAt(sim, month) {
  return sim.projects.reduce((a, p) => a + arcMonthlyFor(p, month, sim.annualRate), 0);
}

export function reduceArcFunding(sim, id) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || p.state !== "completed" || p.arcReduced || (p.arcReductionCount || 0) >= 2) return;
  p.arcReduced = true;
  p.arcReductionCount = (p.arcReductionCount || 0) + 1;
  sim.decisions.push({ month: sim.month, type: "arc_reduce", id, title: p.title });
}

export function restoreArcFunding(sim, id) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || !p.arcReduced) return;
  const backlog = p.arcBacklog || 0;
  if (sim.availableBalance + 1e-6 < backlog) return;
  sim.availableBalance = +(sim.availableBalance - backlog).toFixed(6);
  p.arcReduced = false;
  p.arcBacklog = 0;
  sim.decisions.push({ month: sim.month, type: "arc_restore", id, title: p.title });
}

export function cutArcCompletely(sim, id) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || p.state !== "completed") return;
  p.state = "abandoned";
  p.arcCutoff = true;
  p.arcReduced = false;
  p.arcBacklog = 0;
  sim.decisions.push({ month: sim.month, type: "arc_cutoff", id, title: p.title });
}

/* ---- Social Benefits (BU) ---- */
export const isBenefitTracked = (p) => p.state === "completed" || (p.state === "abandoned" && p.arcCutoff);

export function benefitMonthlyFor(p, month) {
  if (!p.buRate || !p.completionMonth || month <= p.completionMonth) return 0;
  if (p.arcCutoff) return -1.5 * p.buRate;
  return p.arcReduced ? p.buRate * 0.4 : p.buRate;
}

export function benefitPotentialFor(p, uptoMonth) {
  if (!p.buRate || !p.completionMonth) return 0;
  return p.buRate * Math.max(0, uptoMonth - p.completionMonth);
}

export function totalDemandAt(sim, month) {
  const arc = sim.config?.arcEnabled ? arcDemandAt(sim, month) : 0;
  return demandAt(sim, month) + arc;
}

/* ---- project mutations ---- */
export function rebaseline(p, newRemainingMonths, atMonth) {
  const remBudget = Math.max(0, p.bacCurrent - p.nominalSpent);
  p.sCurve = generateSCurve(remBudget, newRemainingMonths);
  const elapsed = atMonth - p.startMonth;
  p.durationCurrent = elapsed + p.sCurve.length;
}

export function addProject(sim, id) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || p.state !== "available") return;
  const cap = sim.config?.concurrentCap || 0;
  if (cap > 0) {
    const live = sim.projects.filter((x) => x.state === "active" || x.state === "pending").length;
    if (live >= cap) return;
  }
  const bac = +(p.bacInitial * inflator(sim.monthlyRate, sim.month)).toFixed(4);
  p.bacCurrent = bac;
  p.sCurveBaseline = [];
  const lag = sim.config?.approvalLag || 0;
  if (lag > 0) {
    p.state = "pending";
    p.pendingUntil = sim.month + lag;
    p.startMonth = null;
    p.sCurve = [];
  } else {
    p.sCurve = generateSCurve(bac, p.durationPlanned);
    p.sCurveBaseline = p.sCurve.slice();
    p.state = "active";
    p.startMonth = sim.month;
    p.durationCurrent = p.durationPlanned;
  }
  sim.decisions.push({ month: sim.month, type: "add", id, title: p.title });
}

export function slowProject(sim, id, s) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || p.state !== "active" || s <= 0 || s >= 1) return;
  rebaseline(p, Math.ceil(p.sCurve.length / (1 - s)), sim.month);
  sim.decisions.push({ month: sim.month, type: "slow", id, title: p.title, s });
}

export function speedProject(sim, id, a) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || p.state !== "active" || a <= 0 || a >= 1) return;
  const remBudget = Math.max(0, p.bacCurrent - p.nominalSpent);
  const premium = remBudget * CRASH_K * a;
  p.bacCurrent = +(p.bacCurrent + premium).toFixed(4);
  const newRem = Math.max(1, Math.ceil(p.sCurve.length * (1 - a)));
  rebaseline(p, newRem, sim.month);
  sim.decisions.push({ month: sim.month, type: "speed", id, title: p.title, a });
}

export function suspendProject(sim, id) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || p.state !== "active") return;
  p.state = "suspended";
  sim.decisions.push({ month: sim.month, type: "suspend", id, title: p.title });
}

export function resumeProject(sim, id) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || p.state !== "suspended") return;
  p.suspendPenalty += Math.ceil(p.sCurve.length * 0.1);
  rebaseline(p, Math.ceil(p.sCurve.length * 1.1), sim.month);
  p.state = "active";
  sim.decisions.push({ month: sim.month, type: "resume", id, title: p.title });
}

export function abandonProject(sim, id) {
  const p = sim.projects.find((x) => x.id === id);
  if (!p || (p.state !== "active" && p.state !== "suspended")) return;
  if (p.political && p.lockUntil && sim.month <= p.lockUntil) return;
  p.state = "abandoned";
  p.sCurve = [];
  sim.decisions.push({ month: sim.month, type: "abandon", id, title: p.title });
}

/* ---- advance the month ---- */
export function deductAndProgress(sim, rng) {
  const m = sim.month;
  sim.projects.filter((p) => p.state === "pending" && m >= p.pendingUntil).forEach((p) => {
    p.state = "active";
    p.startMonth = m;
    p.sCurve = generateSCurve(p.bacCurrent, p.durationPlanned);
    p.sCurveBaseline = p.sCurve.slice();
    p.durationCurrent = p.durationPlanned;
  });
  const capexDemand = demandAt(sim, m);
  sim.availableBalance = +(sim.availableBalance - capexDemand).toFixed(6);
  sim.alerts = [];
  for (const p of actives(sim)) {
    const nom = p.sCurve.shift() || 0;
    (p.drawHistory = p.drawHistory || []).push({ m, nom });
    p.nominalSpent += nom;
    p.cashDrawn += nom * inflator(sim.monthlyRate, m);
    const prog = p.bacCurrent ? p.nominalSpent / p.bacCurrent : 1;
    for (const mEdge of [0.25, 0.5, 0.75]) {
      const key = mEdge * 100;
      if (prog >= mEdge && !p.milestones.includes(key)) {
        p.milestones.push(key);
        let costDelta = 0, durDelta = 0;
        if (rng() < p.costRisk) {
          const sign = rng() < 0.5 ? 1 : -1;
          costDelta = sign * p.costRisk;
          p.bacCurrent = +(p.bacCurrent * (1 + costDelta)).toFixed(4);
        }
        if (rng() < p.durRisk) {
          const sign = rng() < 0.5 ? 1 : -1;
          durDelta = sign * p.durRisk;
          const rem = Math.max(1, Math.round(p.sCurve.length * (1 + durDelta)));
          rebaseline(p, rem, m);
        } else if (costDelta) {
          rebaseline(p, Math.max(1, p.sCurve.length), m);
        }
        if (costDelta || durDelta) {
          const ev = {
            month: m, id: p.id, title: p.title, milestone: key,
            costDelta, durDelta, newBac: p.bacCurrent,
            newEnd: p.startMonth + (p.durationCurrent || 0),
          };
          sim.events.push(ev);
          sim.alerts.push(ev);
        }
      }
    }
    if (p.sCurve.length === 0 && p.state === "active") {
      p.state = "completed";
      p.completionMonth = m;
      p.arcBaseBac = p.bacCurrent;
    }
  }
  let arcAmount = 0;
  if (sim.config?.arcEnabled) {
    for (const p of sim.projects) {
      if (p.state !== "completed") continue;
      const full = arcFullMonthlyFor(p, m, sim.annualRate);
      if (p.arcReduced) {
        const reduced = full * 0.7;
        p.arcBacklog = +((p.arcBacklog || 0) + (full - reduced)).toFixed(6);
        arcAmount += reduced;
      } else {
        arcAmount += full;
      }
    }
  }
  sim.availableBalance = +(sim.availableBalance - arcAmount).toFixed(6);
  if (sim.config?.benefitsEnabled) {
    for (const p of sim.projects) {
      if (!isBenefitTracked(p)) continue;
      p.buCumulative = +((p.buCumulative || 0) + benefitMonthlyFor(p, m)).toFixed(3);
    }
  }
  sim.history.push({ month: m, demand: +capexDemand.toFixed(3), arc: +arcAmount.toFixed(3), balanceAfter: +sim.availableBalance.toFixed(3) });
  sim.month = m + 1;
  if (sim.month <= 60) {
    const freq = sim.config?.fundingFrequency ?? 3;
    if ((sim.month - 1) % freq === 0) {
      const qi = Math.floor((sim.month - 1) / freq);
      const release = sim.releaseSchedule?.[qi] ?? sim.quarterlyRelease;
      sim.quarterlyRelease = release;
      sim.availableBalance = +(sim.availableBalance + release).toFixed(6);
      sim.released = +(sim.released + release).toFixed(4);
    }
  } else {
    finalize(sim);
  }
}

export function finalize(sim, { insolvent = false } = {}) {
  sim.projects.forEach((p) => {
    if (p.state === "active" || p.state === "suspended" || p.state === "pending") p.state = "expired";
  });
  sim.status = "ended";
  sim.insolvent = insolvent;
  sim.endMonth = sim.month;
  sim.endedAt = Date.now();
  sim.durationSeconds = sim.startedAt ? Math.max(0, Math.round((sim.endedAt - sim.startedAt) / 1000)) : null;
  sim.score = scoreSim(sim);
}

export function endInsolvent(sim) {
  if (sim.status === "ended") return;
  finalize(sim, { insolvent: true });
}

export function projectCompletionPct(p) {
  if (!p) return 0;
  if (p.state === "completed") return 1;
  if (!p.bacCurrent || p.bacCurrent <= 0) return 0;
  return Math.max(0, Math.min(0.999, (p.nominalSpent || 0) / p.bacCurrent));
}

export function scoreSim(sim) {
  const completed = sim.projects.filter((p) => p.state === "completed");
  const abandoned = sim.projects.filter((p) => p.state === "abandoned");
  const expired = sim.projects.filter((p) => p.state === "expired");
  const benefitsOn = !!sim.config?.benefitsEnabled;
  const partialCreditOn = !!sim.config?.partialCreditEnabled;
  const deliveryMax = benefitsOn ? 35 : 40;
  const alignmentMax = benefitsOn ? 30 : 35;
  const efficiencyMax = benefitsOn ? 20 : 25;

  // Partial credit for unfinished (expired/in-progress at M60) projects proportionate to completion %
  const partialProjects = partialCreditOn
    ? expired.filter((p) => (p.nominalSpent || 0) > 0 && (p.bacCurrent || 0) > 0)
    : [];
  const partialCompletions = partialCreditOn
    ? partialProjects.reduce((a, p) => a + projectCompletionPct(p), 0)
    : 0;
  const effectiveCompleted = completed.length + partialCompletions;

  const delivery = Math.min(effectiveCompleted / Math.max(1, sim.maxComp), 1) * deliveryMax;

  let weightedAlignNumerator = completed.reduce((a, p) => a + p.alignment, 0);
  if (partialCreditOn && partialProjects.length > 0) {
    weightedAlignNumerator += partialProjects.reduce(
      (a, p) => a + p.alignment * projectCompletionPct(p),
      0
    );
  }
  const avgCompletedAlign =
    effectiveCompleted > 0 ? weightedAlignNumerator / effectiveCompleted : 0;
  const alignment = effectiveCompleted > 0 ? avgCompletedAlign * alignmentMax : 0;

  const sunk = abandoned.reduce((a, p) => a + p.cashDrawn, 0);
  const unspent = Math.max(0, sim.availableBalance);
  const wasted = Math.min(1, Math.max(0, (sunk + unspent) / sim.totalBudget));
  const efficiency = (1 - wasted) * efficiencyMax;
  const benefitTracked = sim.projects.filter(isBenefitTracked);
  const benefitsPotentialBU = benefitTracked.reduce((a, p) => a + benefitPotentialFor(p, sim.month), 0);
  const benefitsBU = benefitTracked.reduce((a, p) => a + (p.buCumulative || 0), 0);
  const benefits = benefitsOn
    ? (benefitsPotentialBU > 0 ? Math.max(0, Math.min(1, benefitsBU / benefitsPotentialBU)) * 15 : 0)
    : 0;
  const arcReductions = sim.projects.reduce((a, p) => a + (p.arcReductionCount || 0), 0);
  const insolvencyPenalty = sim.insolvent ? 10 : 0;
  const raw = delivery + alignment + efficiency + benefits;
  const expiredPenalty = partialCreditOn ? 0 : expired.length * 1;
  const penalty = abandoned.length * 2 + expiredPenalty + arcReductions * 2 + insolvencyPenalty;
  const final = Math.max(0, raw - penalty);
  const band =
    final >= 85 ? "Excellent" : final >= 70 ? "Good" :
    final >= 55 ? "Satisfactory" : final >= 40 ? "Poor" : "Needs Development";
  return {
    delivery, alignment, efficiency, benefits, raw, penalty, final, band, wasted,
    deliveryMax, alignmentMax, efficiencyMax,
    completed: completed.length,
    partialCreditOn,
    partialProjectCount: partialProjects.length,
    partialCompletions: +partialCompletions.toFixed(2),
    effectiveCompleted: +effectiveCompleted.toFixed(2),
    avgCompletedAlign: +avgCompletedAlign.toFixed(4),
    abandoned: abandoned.length, expired: expired.length, expiredPenalty, arcReductions,
    insolvent: !!sim.insolvent, insolvencyPenalty,
    benefitsOn, benefitsBU, benefitsPotentialBU,
  };
}

export function optimalBenchmark(sim) {
  const ranked = [...sim.projects].sort((a, b) => (b.alignment / b.bacInitial) - (a.alignment / a.bacInitial));
  let cum = 0; const set = [];
  for (const p of ranked) { if (cum + p.bacInitial <= sim.totalBudget) { cum += p.bacInitial; set.push(p); } }
  const avg = set.length ? set.reduce((a, p) => a + p.alignment, 0) / set.length : 0;
  return { count: set.length, avgAlignment: avg, ids: set.map((p) => p.id) };
}

export function liveScore(sim) {
  const probe = clone(sim);
  finalize(probe);
  return probe.score;
}

/* ============================================================
   AI OPTIMIZER: GOAL RANKING DEFINITIONS & OBJECTIVE FUNCTION
   ============================================================ */
export const DEFAULT_GOAL_RANKING = ["projects", "alignment", "utilization", "benefits"];

export const GOAL_METADATA = {
  projects: {
    id: "projects",
    label: "Maximize Number of Projects",
    shortLabel: "Projects Delivered",
    description: "Prioritize completing the highest possible count of candidate projects before Month 60.",
  },
  alignment: {
    id: "alignment",
    label: "Alignment Score",
    shortLabel: "Strategic Alignment",
    description: "Prioritize projects with the highest strategic alignment percentage (quality of portfolio).",
  },
  utilization: {
    id: "utilization",
    label: "Utilization of Funds",
    shortLabel: "Funds Utilization",
    description: "Deploy maximum available budget into completed projects with minimal idle cash or sunk cost.",
  },
  benefits: {
    id: "benefits",
    label: "Social Benefits",
    shortLabel: "Social Benefits (BU)",
    description: "Maximize cumulative Benefit Units (BU) by delivering high-BU projects early and protecting ARC.",
  },
};

export const RANK_WEIGHTS = [0.55, 0.24, 0.13, 0.08]; // Rank #1 = 55%, #2 = 24%, #3 = 13%, #4 = 8%

/**
 * Compute theoretical maximum Benefit Units achievable within `totalBudget`
 * if top BU/cost projects started at Month 1 without delay.
 */
export function computeMaxTheoreticalBU(projects, totalBudget, lag = 0) {
  const candidates = projects.map((p) => {
    const buRate = p.buRate || computeDefaultBuRate(p.bacInitial, p.subCategory, p.costRisk, p.durRisk);
    const activeMonths = Math.max(0, 60 - (1 + lag + p.durationPlanned));
    const maxBu = buRate * activeMonths;
    return { bac: p.bacInitial, maxBu, ratio: maxBu / Math.max(0.1, p.bacInitial) };
  }).sort((a, b) => b.ratio - a.ratio);

  let budgetLeft = totalBudget;
  let totalMaxBu = 0;
  for (const c of candidates) {
    if (c.bac <= budgetLeft) {
      budgetLeft -= c.bac;
      totalMaxBu += c.maxBu;
    }
  }
  return Math.max(1, totalMaxBu);
}

/**
 * Compute all 4 normalized goal scores [0..100] and a single ranked scalar objective
 * for a finalized (or probed) `sim` state.
 * Works regardless of whether `sim.config.benefitsEnabled` was toggled on or off.
 */
export function evaluateRankedObjective(
  sim,
  goalRanking = DEFAULT_GOAL_RANKING,
  maxTheoBU = null,
  optimizeFor = "ranked"
) {
  const s = sim.score || scoreSim(sim);
  const completed = sim.projects.filter((p) => p.state === "completed");
  const abandoned = sim.projects.filter((p) => p.state === "abandoned");
  const expired = sim.projects.filter((p) => p.state === "expired");
  const partialCreditOn = !!sim.config?.partialCreditEnabled;

  const partialProjects = partialCreditOn
    ? expired.filter((p) => (p.nominalSpent || 0) > 0 && (p.bacCurrent || 0) > 0)
    : [];
  const partialCompletions = partialCreditOn
    ? partialProjects.reduce((a, p) => a + projectCompletionPct(p), 0)
    : 0;
  const effectiveCompleted = completed.length + partialCompletions;

  // 1. Number of Projects score (0..100, with bonus above maxComp)
  const compRatio = effectiveCompleted / Math.max(1, sim.maxComp);
  const projectsScore = Math.min(115, compRatio * 100);

  // 2. Strategic Alignment score (0..100)
  // Average alignment of completed (and partial-credit) projects, requiring a minimum viable portfolio size (~35% of maxComp)
  let weightedAlignNumerator = completed.reduce((a, p) => a + p.alignment, 0);
  if (partialCreditOn && partialProjects.length > 0) {
    weightedAlignNumerator += partialProjects.reduce(
      (a, p) => a + p.alignment * projectCompletionPct(p),
      0
    );
  }
  const avgAlignment =
    effectiveCompleted > 0 ? weightedAlignNumerator / effectiveCompleted : 0;
  const minViableCount = Math.max(1, Math.min(sim.maxComp * 0.38, sim.projects.length * 0.25));
  const portfolioMassFactor = Math.min(1, effectiveCompleted / minViableCount);
  const alignmentScore = avgAlignment * portfolioMassFactor * 100;

  // 3. Utilization of Funds score (0..100)
  const sunk = abandoned.reduce((a, p) => a + p.cashDrawn, 0);
  const unspent = Math.max(0, sim.availableBalance);
  const wastedRatio = Math.min(1, Math.max(0, (sunk + unspent) / Math.max(1, sim.totalBudget)));
  const utilizationRate = 1 - wastedRatio;
  const utilizationScore = utilizationRate * 100;

  // 4. Social Benefits score (0..100)
  // Always compute exact cumulative BU even if benefitsEnabled was false
  const upperBU = maxTheoBU || computeMaxTheoreticalBU(sim.projects, sim.totalBudget, sim.config?.approvalLag || 0);
  let totalRealizedBU = 0;
  let totalPotentialBU = 0;
  for (const p of sim.projects) {
    if (!isBenefitTracked(p)) continue;
    const pot = benefitPotentialFor(p, 61);
    totalPotentialBU += pot;
    if (sim.config?.benefitsEnabled && p.buCumulative != null) {
      totalRealizedBU += p.buCumulative;
    } else if (p.completionMonth) {
      // Reconstruct BU if benefitsEnabled wasn't tracking buCumulative each tick
      const monthsActive = Math.max(0, 60 - p.completionMonth);
      const factor = p.arcCutoff ? -1.5 : p.arcReduced ? 0.4 : 1.0;
      totalRealizedBU += (p.buRate || 0) * monthsActive * factor;
    }
  }
  const buRetentionRatio = totalPotentialBU > 0 ? Math.max(0, Math.min(1, totalRealizedBU / totalPotentialBU)) : 0;
  const buVolumeRatio = Math.max(0, Math.min(1.15, totalRealizedBU / Math.max(1, upperBU * 0.72)));
  const benefitsScore = (buVolumeRatio * 0.70 + buRetentionRatio * 0.30) * 100;

  const goalScores = {
    projects: +projectsScore.toFixed(2),
    alignment: +alignmentScore.toFixed(2),
    utilization: +utilizationScore.toFixed(2),
    benefits: +benefitsScore.toFixed(2),
  };

  const ranking = Array.isArray(goalRanking) && goalRanking.length === 4 ? goalRanking : DEFAULT_GOAL_RANKING;
  let weightedSum = 0;
  ranking.forEach((goalId, idx) => {
    const w = RANK_WEIGHTS[idx] ?? 0.1;
    weightedSum += (goalScores[goalId] ?? 0) * w;
  });

  // Strict penalties for insolvency, abandonments, expirations (only when partialCreditOn is false), and ARC cuts
  const arcReductions = sim.projects.reduce((a, p) => a + (p.arcReductionCount || 0), 0);
  const penalty =
    (sim.insolvent ? 65 : 0) +
    abandoned.length * 4.5 +
    (partialCreditOn ? 0 : expired.length * 3.0) +
    arcReductions * 2.0;

  // When `optimizeFor === "official_score"`, directly maximize the official simulator score (`s.final`)
  const objectiveScore =
    optimizeFor === "official_score"
      ? Math.max(0, (s.final || 0) + utilizationRate * 0.05 + avgAlignment * 0.05 - (sim.insolvent ? 50 : 0))
      : Math.max(0, weightedSum - penalty + (s.final || 0) * 0.08);

  return {
    objectiveScore: +objectiveScore.toFixed(3),
    weightedGoalScore: +Math.max(0, weightedSum - penalty).toFixed(2),
    simScore: +(s.final || 0).toFixed(2),
    band: s.band,
    scoreBreakdown: s,
    goalScores,
    metrics: {
      completedCount: completed.length,
      partialCreditOn,
      partialProjectCount: partialProjects.length,
      partialCompletions: +partialCompletions.toFixed(2),
      effectiveCompleted: +effectiveCompleted.toFixed(2),
      maxComp: sim.maxComp,
      abandonedCount: abandoned.length,
      expiredCount: expired.length,
      avgAlignment: +avgAlignment.toFixed(4),
      utilizationRate: +utilizationRate.toFixed(4),
      unspentCash: +unspent.toFixed(2),
      sunkCost: +sunk.toFixed(2),
      totalRealizedBU: +totalRealizedBU.toFixed(1),
      totalPotentialBU: +totalPotentialBU.toFixed(1),
      arcReductions,
      insolvent: !!sim.insolvent,
    },
  };
}

/**
 * Apply an array of actions for the current `sim.month` without advancing the month.
 */
export function applyActionsForCurrentMonth(sim, actions = []) {
  for (const act of actions) {
    if (!act || !act.type) continue;
    switch (act.type) {
      case "add":
        addProject(sim, act.id);
        break;
      case "slow":
        slowProject(sim, act.id, act.s);
        break;
      case "speed":
        speedProject(sim, act.id, act.a);
        break;
      case "suspend":
        suspendProject(sim, act.id);
        break;
      case "resume":
        resumeProject(sim, act.id);
        break;
      case "abandon":
        abandonProject(sim, act.id);
        break;
      case "arc_reduce":
        reduceArcFunding(sim, act.id);
        break;
      case "arc_restore":
        restoreArcFunding(sim, act.id);
        break;
      case "arc_cutoff":
        cutArcCompletely(sim, act.id);
        break;
      default:
        break;
    }
  }
}

/**
 * Advance `sim` by 1 month using its exact deterministic month seed.
 * If demand exceeds availableBalance (should not happen in valid plans), marks insolvent.
 */
export function advanceOneMonthDeterministic(sim) {
  if (sim.status === "ended") return sim;
  const demand = totalDemandAt(sim, sim.month);
  if (demand > sim.availableBalance + 1e-4) {
    endInsolvent(sim);
    return sim;
  }
  const rng = monthRngFor(sim.seed, sim.month);
  deductAndProgress(sim, rng);
  return sim;
}

/**
 * Replay an entire 60-month action plan on a cloned `initialSim` and return the final `sim`.
 */
export function replayActionPlan(initialSim, monthlyActionPlan) {
  const sim = clone(initialSim);
  const byMonth = new Map();
  for (const entry of monthlyActionPlan || []) {
    byMonth.set(entry.month, entry.actions || []);
  }
  while (sim.status === "running" && sim.month <= 60) {
    const acts = byMonth.get(sim.month) || [];
    applyActionsForCurrentMonth(sim, acts);
    advanceOneMonthDeterministic(sim);
  }
  return sim;
}
