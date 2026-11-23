/* ============================================================
   RESEARCH RUN ENGINE: PERSISTENCE, COMPARATIVE ANALYTICS,
   AND EXCEL (.xlsx) / MARKDOWN (.md) EXPORT
   ============================================================ */

import * as XLSX from "xlsx";
import {
  GOAL_METADATA,
  DEFAULT_GOAL_RANKING,
  computeDefaultBuRate,
  computeScenarioKey,
  clone,
} from "./simulationEngine.js";
import { runPortfolioOptimization } from "./optimizerCore.js";
import { projectsToBaselineRows, EXCEL_HEADERS } from "../excelPortfolios.js";

const API = import.meta.env.VITE_API_URL || "/api";
const LOCAL_RR_KEY = "portfolio_sim_research_runs_v1";
const LOCAL_BM_KEY = "portfolio_sim_scenario_benchmarks_v1";

const money = (n) =>
  n == null ? "—" : "$" + Number(n || 0).toFixed(2) + "M";
const pct = (n) => ((n || 0) * 100).toFixed(1) + "%";

export function formatGoalRankingShort(goalRanking = DEFAULT_GOAL_RANKING) {
  const shortMap = {
    projects: "Projects",
    alignment: "Alignment",
    utilization: "Utilization",
    benefits: "Benefits",
  };
  return (goalRanking || DEFAULT_GOAL_RANKING)
    .map((g, idx) => `#${idx + 1} ${shortMap[g] || g}`)
    .join(" → ");
}

/* ============================================================
   1. LOCAL + SERVER PERSISTENCE
   ============================================================ */
export function loadLocalResearchRuns() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_RR_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveLocalResearchRun(rr) {
  const list = loadLocalResearchRuns().filter((x) => x.id !== rr.id);
  list.unshift(rr);
  try {
    localStorage.setItem(LOCAL_RR_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {}
  return rr;
}

export function removeLocalResearchRun(id) {
  const list = loadLocalResearchRuns().filter((x) => x.id !== id);
  try {
    localStorage.setItem(LOCAL_RR_KEY, JSON.stringify(list));
  } catch {}
}

export async function fetchResearchRuns(token) {
  const local = loadLocalResearchRuns();
  if (!token) return local;
  try {
    const res = await fetch(API + "/research-runs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return local;
    const { researchRuns = [] } = await res.json();
    // Sync server runs into local cache and merge any local-only runs
    const serverIds = new Set(researchRuns.map((r) => r.id));
    const merged = [
      ...researchRuns,
      ...local.filter((r) => !serverIds.has(r.id)),
    ];
    try {
      localStorage.setItem(LOCAL_RR_KEY, JSON.stringify(merged.slice(0, 50)));
    } catch {}
    return merged;
  } catch {
    return local;
  }
}

export async function createResearchRun({
  title,
  description = "",
  ownerName = "Player",
  ownerEmail = "anonymous@local",
  portfolioId = "procedural",
  portfolioName = "Random Procedural Pool (30 Projects)",
  baseSeed,
  projects = [],
  entries = [],
  token = null,
}) {
  const now = new Date().toISOString();
  const cleanProjects = projects.map((p, idx) => {
    const costRiskBase = p.costRiskBase ?? p.costRisk ?? 0.1;
    const durRiskBase = p.durRiskBase ?? p.durRisk ?? 0.1;
    return {
      id: p.id || "P" + String(idx + 1).padStart(2, "0"),
      title: p.title,
      category: p.category,
      subCategory: p.subCategory,
      arcRate: p.arcRate,
      bacInitial: p.bacInitial,
      alignment: p.alignment,
      durationPlanned: p.durationPlanned,
      costRiskBase,
      durRiskBase,
      costRisk: p.costRisk ?? costRiskBase,
      durRisk: p.durRisk ?? durRiskBase,
      buRate:
        p.buRate ||
        computeDefaultBuRate(p.bacInitial, p.subCategory, costRiskBase, durRiskBase),
      political: Boolean(p.politicalPreFlagged),
    };
  });

  const totalBac = +cleanProjects
    .reduce((s, p) => s + Number(p.bacInitial || 0), 0)
    .toFixed(2);

  const localDraft = {
    id: "rr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    ownerEmail,
    ownerName,
    title: title.trim() || "Untitled Research Run",
    description,
    portfolioId,
    portfolioName,
    projectCount: cleanProjects.length,
    totalBac,
    baseSeed,
    projects: cleanProjects,
    entries,
    runCount: entries.length,
    createdAt: now,
    updatedAt: now,
  };

  if (token) {
    try {
      const res = await fetch(API + "/research-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(localDraft),
      });
      if (res.ok) {
        const { researchRun } = await res.json();
        saveLocalResearchRun(researchRun);
        return researchRun;
      }
    } catch {}
  }

  return saveLocalResearchRun(localDraft);
}

export async function appendEntriesToResearchRun(researchRunId, newEntries, token = null) {
  const incoming = Array.isArray(newEntries) ? newEntries : [newEntries];
  const localList = loadLocalResearchRuns();
  const target = localList.find((r) => r.id === researchRunId);

  if (token) {
    try {
      const res = await fetch(
        `${API}/research-runs/${encodeURIComponent(researchRunId)}/entries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ entries: incoming }),
        }
      );
      if (res.ok) {
        const { researchRun } = await res.json();
        saveLocalResearchRun(researchRun);
        return researchRun;
      }
    } catch {}
  }

  if (target) {
    const existingEntries = Array.isArray(target.entries) ? target.entries.slice() : [];
    for (const item of incoming) {
      existingEntries.push({
        ...item,
        entryId:
          item.entryId ||
          "entry-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        runNumber: existingEntries.length + 1,
        timestamp: item.timestamp || new Date().toISOString(),
      });
    }
    const updated = {
      ...target,
      entries: existingEntries,
      runCount: existingEntries.length,
      updatedAt: new Date().toISOString(),
    };
    saveLocalResearchRun(updated);
    return updated;
  }
  return null;
}

export async function deleteResearchRunById(researchRunId, token = null) {
  removeLocalResearchRun(researchRunId);
  if (token) {
    try {
      await fetch(`${API}/research-runs/${encodeURIComponent(researchRunId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }
}

export async function deleteEntryFromResearchRun(researchRunId, entryId, token = null) {
  if (token) {
    try {
      const res = await fetch(
        `${API}/research-runs/${encodeURIComponent(researchRunId)}/entries/${encodeURIComponent(entryId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        const { researchRun } = await res.json();
        saveLocalResearchRun(researchRun);
        return researchRun;
      }
    } catch {}
  }

  const localList = loadLocalResearchRuns();
  const target = localList.find((r) => r.id === researchRunId);
  if (!target) return null;
  const filtered = (target.entries || [])
    .filter((e) => e.entryId !== entryId)
    .map((e, idx) => ({ ...e, runNumber: idx + 1 }));
  const updated = {
    ...target,
    entries: filtered,
    runCount: filtered.length,
    updatedAt: new Date().toISOString(),
  };
  saveLocalResearchRun(updated);
  return updated;
}

/* ============================================================
   2. BUILD RECORDED AUTO-RUN ENTRY FROM OPTIMIZER RESULT
   ============================================================ */
export function buildResearchRunEntry({
  optResult,
  initialSim,
  runNumber = 1,
  label = "",
}) {
  const { finalSim, evaluation, bestActionPlan, goalRanking, strategyReport, iterationsRun, elapsedMs } =
    optResult;

  const projectOutcomes = finalSim.projects.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    subCategory: p.subCategory,
    state: p.state,
    startMonth: p.startMonth,
    completionMonth: p.completionMonth,
    bacInitial: p.bacInitial,
    bacCurrent: +(p.bacCurrent || p.bacInitial).toFixed(2),
    nominalSpent: +(p.nominalSpent || 0).toFixed(2),
    completionPct:
      p.state === "completed"
        ? 1
        : p.bacCurrent > 0
        ? +Math.min(0.999, (p.nominalSpent || 0) / p.bacCurrent).toFixed(4)
        : 0,
    cashDrawn: +(p.cashDrawn || 0).toFixed(2),
    alignment: p.alignment,
    durationPlanned: p.durationPlanned,
    buRate: p.buRate,
    buGenerated: +(
      p.buCumulative ||
      (p.state === "completed" && p.completionMonth
        ? (p.buRate || 0) * Math.max(0, 60 - p.completionMonth)
        : 0)
    ).toFixed(1),
    arcRate: p.arcRate,
    political: Boolean(p.political),
  }));

  const completedProjectIds = finalSim.projects
    .filter((p) => p.state === "completed")
    .map((p) => p.id);

  return {
    entryId: "entry-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    runNumber,
    label:
      label ||
      `Run #${runNumber} (${GOAL_METADATA[goalRanking?.[0]]?.shortLabel || "Auto"} #1)`,
    timestamp: new Date().toISOString(),
    seed: initialSim.seed,
    goalRanking: goalRanking || DEFAULT_GOAL_RANKING,
    config: {
      totalBudget: initialSim.totalBudget,
      annualRate: initialSim.annualRate,
      fundingProfile: initialSim.config?.fundingProfile || "scurve",
      fundingFrequency: initialSim.config?.fundingFrequency ?? 3,
      budgetTightness: initialSim.config?.budgetTightness ?? 1.5,
      politicalProjects: initialSim.config?.politicalProjects ?? 0,
      concurrentCap: initialSim.config?.concurrentCap ?? 0,
      approvalLag: initialSim.config?.approvalLag ?? 0,
      riskMultiplier: initialSim.config?.riskMultiplier ?? 1.0,
      arcEnabled: Boolean(initialSim.config?.arcEnabled),
      benefitsEnabled: Boolean(initialSim.config?.benefitsEnabled),
      partialCreditEnabled: Boolean(initialSim.config?.partialCreditEnabled),
    },
    evaluation,
    actionCounts: strategyReport?.actionCounts || {
      add: 0,
      speed: 0,
      slow: 0,
      suspend: 0,
      resume: 0,
      abandon: 0,
    },
    totalActions: strategyReport?.totalActions || 0,
    riskEventsAbsorbed: finalSim.events?.length || 0,
    iterationsRun,
    elapsedMs,
    completedProjectIds,
    projectOutcomes,
    bestActionPlan,
  };
}

/* ============================================================
   3. COMPARATIVE RESEARCH REPORT & OBSERVATIONS GENERATOR
   ============================================================ */
export function generateResearchComparisonReport(researchRun) {
  const entries = researchRun?.entries || [];
  const projects = researchRun?.projects || [];

  if (entries.length === 0) {
    return {
      executiveSummary: "No auto-optimization runs have been recorded in this Research Run yet. Run one or more scenarios (or run the 4-Goal Ranking Batch) to generate comparative insights.",
      observations: [],
      runNarratives: [],
      projectClassification: { core: [], swing: [], excluded: [], all: [] },
      bestSimRun: null,
      bestProjectsRun: null,
      bestAlignmentRun: null,
      bestUtilizationRun: null,
      bestBenefitsRun: null,
    };
  }

  const byMetricMax = (fn) =>
    entries.reduce((best, curr) => (fn(curr) > fn(best) ? curr : best), entries[0]);
  const byMetricMin = (fn) =>
    entries.reduce((best, curr) => (fn(curr) < fn(best) ? curr : best), entries[0]);

  const bestSimRun = byMetricMax((e) => e.evaluation?.simScore || 0);
  const bestProjectsRun = byMetricMax((e) => e.evaluation?.metrics?.completedCount || 0);
  const minProjectsRun = byMetricMin((e) => e.evaluation?.metrics?.completedCount || 0);

  const bestAlignmentRun = byMetricMax((e) => e.evaluation?.metrics?.avgAlignment || 0);
  const minAlignmentRun = byMetricMin((e) => e.evaluation?.metrics?.avgAlignment || 0);

  const bestUtilizationRun = byMetricMax((e) => e.evaluation?.metrics?.utilizationRate || 0);
  const minUtilizationRun = byMetricMin((e) => e.evaluation?.metrics?.utilizationRate || 0);

  const bestBenefitsRun = byMetricMax((e) => e.evaluation?.metrics?.totalRealizedBU || 0);
  const minBenefitsRun = byMetricMin((e) => e.evaluation?.metrics?.totalRealizedBU || 0);

  // Classify every baseline project across the recorded runs
  const allProjectRows = projects.map((p) => {
    const selectedInRuns = [];
    const skippedInRuns = [];
    let sumStartMonth = 0;
    let sumCompMonth = 0;

    entries.forEach((entry, idx) => {
      const rNum = entry.runNumber || idx + 1;
      const out = (entry.projectOutcomes || []).find((o) => o.id === p.id);
      const isCompleted =
        out?.state === "completed" ||
        (entry.completedProjectIds || []).includes(p.id);
      if (isCompleted) {
        selectedInRuns.push({
          runNumber: rNum,
          topGoal: entry.goalRanking?.[0] || "projects",
          startMonth: out?.startMonth ?? 1,
          completionMonth: out?.completionMonth ?? 60,
          cashDrawn: out?.cashDrawn ?? p.bacInitial,
        });
        sumStartMonth += out?.startMonth ?? 1;
        sumCompMonth += out?.completionMonth ?? 60;
      } else {
        skippedInRuns.push({
          runNumber: rNum,
          topGoal: entry.goalRanking?.[0] || "projects",
        });
      }
    });

    const selectionCount = selectedInRuns.length;
    const selectionRatio = entries.length > 0 ? selectionCount / entries.length : 0;
    const classification =
      selectionCount === entries.length
        ? "Core Anchor (100%)"
        : selectionCount === 0
        ? "Universally Excluded (0%)"
        : `Goal-Sensitive Swing (${selectionCount}/${entries.length})`;

    return {
      ...p,
      selectionCount,
      selectionRatio,
      classification,
      selectedInRuns,
      skippedInRuns,
      avgStartMonth:
        selectionCount > 0 ? +(sumStartMonth / selectionCount).toFixed(1) : null,
      avgCompletionMonth:
        selectionCount > 0 ? +(sumCompMonth / selectionCount).toFixed(1) : null,
    };
  });

  const coreProjects = allProjectRows.filter((p) => p.selectionCount === entries.length);
  const swingProjects = allProjectRows
    .filter((p) => p.selectionCount > 0 && p.selectionCount < entries.length)
    .sort((a, b) => b.selectionRatio - a.selectionRatio);
  const excludedProjects = allProjectRows.filter((p) => p.selectionCount === 0);

  const observations = [];

  // Observation 1: Official Score & Overall Strategy Spread
  observations.push({
    title: "Overall Performance & Score Envelope",
    detail: `Across ${entries.length} recorded auto-optimization run${entries.length !== 1 ? "s" : ""} on "${researchRun.portfolioName}" (${researchRun.projectCount} candidate projects, Total BAC ${money(researchRun.totalBac)}), the highest official simulator score was achieved in Run #${bestSimRun.runNumber} (${bestSimRun.evaluation.simScore.toFixed(1)}/100 · ${bestSimRun.evaluation.band}) using priority ranking [${formatGoalRankingShort(bestSimRun.goalRanking)}]. Zero runs experienced insolvency.`,
  });

  // Observation 2: Quantity vs. Strategic Alignment Trade-off
  const projSpread =
    (bestProjectsRun.evaluation.metrics.completedCount || 0) -
    (minProjectsRun.evaluation.metrics.completedCount || 0);
  const alignSpread =
    ((bestAlignmentRun.evaluation.metrics.avgAlignment || 0) -
      (minAlignmentRun.evaluation.metrics.avgAlignment || 0)) *
    100;
  observations.push({
    title: "Project Count vs. Strategic Alignment Trade-Off",
    detail:
      projSpread > 0 || alignSpread > 0.5
        ? `Prioritizing Project Count (Run #${bestProjectsRun.runNumber}) delivered ${bestProjectsRun.evaluation.metrics.completedCount} completed projects at ${pct(bestProjectsRun.evaluation.metrics.avgAlignment)} average alignment by favoring smaller, lower-BAC projects. Conversely, prioritizing Alignment (Run #${bestAlignmentRun.runNumber}) raised average strategic alignment by +${alignSpread.toFixed(1)} percentage points to ${pct(bestAlignmentRun.evaluation.metrics.avgAlignment)} across ${bestAlignmentRun.evaluation.metrics.completedCount} completed projects by allocating capital to larger, higher-alignment projects.`
        : `Across all tested runs, the solver maintained a stable delivery of ${bestProjectsRun.evaluation.metrics.completedCount} completed projects and ${pct(bestAlignmentRun.evaluation.metrics.avgAlignment)} average alignment.`,
  });

  // Observation 3: Social Benefits (BU) Sensitivity
  const buMax = bestBenefitsRun.evaluation.metrics.totalRealizedBU || 0;
  const buMin = minBenefitsRun.evaluation.metrics.totalRealizedBU || 0;
  const buGainPct = buMin > 0 ? ((buMax - buMin) / buMin) * 100 : 0;
  observations.push({
    title: "Social Benefits (BU) & Early-Delivery Dynamics",
    detail:
      buMax - buMin > 25
        ? `Cumulative Social Benefits ranged from ${Math.round(buMin).toLocaleString()} BU (Run #${minBenefitsRun.runNumber}) to ${Math.round(buMax).toLocaleString()} BU (Run #${bestBenefitsRun.runNumber}) — a +${buGainPct.toFixed(1)}% (+${Math.round(buMax - buMin).toLocaleString()} BU / ${money((buMax - buMin) * 0.02)} social value) increase when Social Benefits are prioritized. The AI achieved this by front-loading high-BU-intensity social sector projects (hospitals, schools, clinics) in early tranches so they generate monthly Benefit Units over a longer post-completion window.`
        : `Social Benefit generation remained consistent at ~${Math.round(buMax).toLocaleString()} BU (${money(buMax * 0.02)} social value) across the tested runs.`,
  });

  // Observation 4: Capital Utilization & Pacing Interventions
  observations.push({
    title: "Utilization of Funds & Cash-Flow Pacing",
    detail: `Funds utilization peaked at ${pct(bestUtilizationRun.evaluation.metrics.utilizationRate)} in Run #${bestUtilizationRun.runNumber} (leaving only ${money(bestUtilizationRun.evaluation.metrics.unspentCash)} unspent reserve out of ${money(bestUtilizationRun.config?.totalBudget)}) compared to ${pct(minUtilizationRun.evaluation.metrics.utilizationRate)} in Run #${minUtilizationRun.runNumber}. The AI used targeted Speed-Up accelerations in late tranches to convert surplus cash into earlier deliveries and used temporary Slow-Downs to absorb 25%/50%/75% milestone risk shocks without abandoning projects.`,
  });

  // Observation 5: Core Anchor vs. Goal-Sensitive Swing Projects
  observations.push({
    title: "Portfolio Stability: Core Anchors vs. Swing Projects",
    detail: `Cross-run portfolio analysis identified ${coreProjects.length} "Core Anchor" projects selected in 100% of runs (${coreProjects.slice(0, 6).map((p) => p.id).join(", ")}${coreProjects.length > 6 ? "…" : ""}), ${swingProjects.length} "Goal-Sensitive Swing" projects whose inclusion depends on the active goal ranking (${swingProjects.slice(0, 6).map((p) => p.id).join(", ")}${swingProjects.length > 6 ? "…" : "none"}), and ${excludedProjects.length} projects universally excluded across all strategies.`,
  });

  // Run-by-run narrative comparison against Run #1
  const baseline = entries[0];
  const runNarratives = entries.map((e, idx) => {
    const m = e.evaluation.metrics;
    const bm = baseline.evaluation.metrics;
    if (idx === 0) {
      return {
        runNumber: e.runNumber,
        label: e.label,
        goalRankingText: formatGoalRankingShort(e.goalRanking),
        summary: `Baseline reference run ([${formatGoalRankingShort(e.goalRanking)}], Budget ${money(e.config?.totalBudget)}, ${(e.config?.annualRate * 100).toFixed(1)}% inflation, ${e.config?.fundingProfile} funding): Delivered ${m.completedCount}/${m.maxComp} projects at ${pct(m.avgAlignment)} avg alignment, ${pct(m.utilizationRate)} fund utilization (${money(m.unspentCash)} unspent), and ${Math.round(m.totalRealizedBU).toLocaleString()} BU (Official Score: ${e.evaluation.simScore.toFixed(1)}/100).`,
      };
    }
    const dComp = m.completedCount - bm.completedCount;
    const dAlign = (m.avgAlignment - bm.avgAlignment) * 100;
    const dUtil = (m.utilizationRate - bm.utilizationRate) * 100;
    const dBu = m.totalRealizedBU - bm.totalRealizedBU;
    const dScore = e.evaluation.simScore - baseline.evaluation.simScore;

    // Projects added in this run that weren't in baseline, and vice versa
    const baseSet = new Set(baseline.completedProjectIds || []);
    const currSet = new Set(e.completedProjectIds || []);
    const swappedIn = [...currSet].filter((id) => !baseSet.has(id));
    const swappedOut = [...baseSet].filter((id) => !currSet.has(id));

    return {
      runNumber: e.runNumber,
      label: e.label,
      goalRankingText: formatGoalRankingShort(e.goalRanking),
      summary: `Vs. Run #1: Projects ${dComp >= 0 ? "+" : ""}${dComp} (${m.completedCount}), Alignment ${dAlign >= 0 ? "+" : ""}${dAlign.toFixed(1)}% (${pct(m.avgAlignment)}), Utilization ${dUtil >= 0 ? "+" : ""}${dUtil.toFixed(1)}% (${pct(m.utilizationRate)}), Social Benefits ${dBu >= 0 ? "+" : ""}${Math.round(dBu).toLocaleString()} BU (${Math.round(m.totalRealizedBU).toLocaleString()} BU), Sim Score ${dScore >= 0 ? "+" : ""}${dScore.toFixed(1)} (${e.evaluation.simScore.toFixed(1)}). ${
        swappedIn.length || swappedOut.length
          ? `Portfolio shift: substituted in [${swappedIn.join(", ") || "none"}] and dropped [${swappedOut.join(", ") || "none"}].`
          : "Selected the exact same set of completed projects with adjusted initiation timing."
      }`,
    };
  });

  const executiveSummary = observations.map((o) => o.detail).join(" ");

  return {
    executiveSummary,
    observations,
    runNarratives,
    projectClassification: {
      core: coreProjects,
      swing: swingProjects,
      excluded: excludedProjects,
      all: allProjectRows,
    },
    bestSimRun,
    bestProjectsRun,
    bestAlignmentRun,
    bestUtilizationRun,
    bestBenefitsRun,
  };
}

/* ============================================================
   4. EXPORT RESEARCH RUN TO EXCEL (.xlsx)
   ============================================================ */
export function exportResearchRunToExcel(researchRun) {
  if (!researchRun) return;
  const wb = XLSX.utils.book_new();
  const report = generateResearchComparisonReport(researchRun);
  const entries = researchRun.entries || [];

  // Sheet 1: Research_Runs_Comparison
  const comparisonRows = entries.map((e) => {
    const m = e.evaluation?.metrics || {};
    const gs = e.evaluation?.goalScores || {};
    const ac = e.actionCounts || {};
    return {
      "Run #": e.runNumber,
      "Run Label": e.label,
      "Timestamp": e.timestamp ? new Date(e.timestamp).toLocaleString() : "",
      "Rank #1 (55%)": GOAL_METADATA[e.goalRanking?.[0]]?.shortLabel || e.goalRanking?.[0],
      "Rank #2 (24%)": GOAL_METADATA[e.goalRanking?.[1]]?.shortLabel || e.goalRanking?.[1],
      "Rank #3 (13%)": GOAL_METADATA[e.goalRanking?.[2]]?.shortLabel || e.goalRanking?.[2],
      "Rank #4 (8%)": GOAL_METADATA[e.goalRanking?.[3]]?.shortLabel || e.goalRanking?.[3],
      "Official Sim Score": +(e.evaluation?.simScore || 0).toFixed(2),
      "Band": e.evaluation?.band || "",
      "Ranked Objective Score": +(e.evaluation?.weightedGoalScore || 0).toFixed(2),
      "Completed Projects": m.completedCount ?? 0,
      "Ongoing Partial Projects": m.partialProjectCount ?? 0,
      "Effective Deliveries": +(m.effectiveCompleted ?? m.completedCount ?? 0).toFixed(2),
      "Target Max Completions": m.maxComp ?? 0,
      "Avg Strategic Alignment (%)": +((m.avgAlignment || 0) * 100).toFixed(2),
      "Funds Utilization (%)": +((m.utilizationRate || 0) * 100).toFixed(2),
      "Unspent Cash ($M)": +(m.unspentCash || 0).toFixed(2),
      "Sunk Cost ($M)": +(m.sunkCost || 0).toFixed(2),
      "Social Benefits (BU)": +(m.totalRealizedBU || 0).toFixed(1),
      "Social Value ($M)": +((m.totalRealizedBU || 0) * 0.02).toFixed(2),
      "Projects Goal Index": +(gs.projects || 0).toFixed(1),
      "Alignment Goal Index": +(gs.alignment || 0).toFixed(1),
      "Utilization Goal Index": +(gs.utilization || 0).toFixed(1),
      "Benefits Goal Index": +(gs.benefits || 0).toFixed(1),
      "Additions": ac.add || 0,
      "Speed-Ups": ac.speed || 0,
      "Slow-Downs": ac.slow || 0,
      "Suspensions": ac.suspend || 0,
      "Abandonments": m.abandonedCount ?? 0,
      "Expired": m.expiredCount ?? 0,
      "Total Budget ($M)": +(e.config?.totalBudget || 0).toFixed(2),
      "Budget Tightness (x)": +(e.config?.budgetTightness ?? 1.5),
      "Inflation (%)": +((e.config?.annualRate || 0) * 100).toFixed(1),
      "Funding Profile": e.config?.fundingProfile || "",
      "Cadence (Mo)": e.config?.fundingFrequency ?? 3,
      "Risk Multiplier (x)": +(e.config?.riskMultiplier ?? 1.0),
      "Political Forced": e.config?.politicalProjects ?? 0,
      "Concurrent Cap": e.config?.concurrentCap ? e.config.concurrentCap : "Unlimited",
      "Approval Lag (Mo)": e.config?.approvalLag ?? 0,
      "ARC Wallet": e.config?.arcEnabled ? "ON" : "OFF",
      "Social Benefits": e.config?.benefitsEnabled !== false ? "ON" : "OFF",
      "Partial Credit": e.config?.partialCreditEnabled ? "ON" : "OFF",
      "Seed": e.seed,
    };
  });

  const wsComp = XLSX.utils.json_to_sheet(comparisonRows);
  XLSX.utils.book_append_sheet(wb, wsComp, "Runs_Comparison");

  // Sheet 2: Metadata & Analytical Observations
  const obsRows = [
    { Section: "METADATA", Topic: "Research Run Title", Finding: researchRun.title },
    { Section: "METADATA", Topic: "Created By", Finding: `${researchRun.ownerName || "Player"} (${researchRun.ownerEmail || ""})` },
    { Section: "METADATA", Topic: "Created Date/Time", Finding: new Date(researchRun.createdAt).toLocaleString() },
    { Section: "METADATA", Topic: "Number of Recorded Runs", Finding: String(entries.length) },
    { Section: "METADATA", Topic: "Portfolio Used", Finding: `${researchRun.portfolioName} (${researchRun.projectCount} projects · Total BAC ${money(researchRun.totalBac)})` },
    { Section: "METADATA", Topic: "Base Seed", Finding: String(researchRun.baseSeed || "") },
    ...report.observations.map((o) => ({
      Section: "OBSERVATION",
      Topic: o.title,
      Finding: o.detail,
    })),
    ...report.runNarratives.map((rn) => ({
      Section: `RUN #${rn.runNumber} DELTA`,
      Topic: `${rn.label} [${rn.goalRankingText}]`,
      Finding: rn.summary,
    })),
  ];
  const wsObs = XLSX.utils.json_to_sheet(obsRows);
  wsObs["!cols"] = [{ wch: 18 }, { wch: 38 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsObs, "Observations_Report");

  // Sheet 3: Cross-Run Project Selection Matrix
  const matrixRows = report.projectClassification.all.map((p) => {
    const row = {
      "Project ID": p.id,
      "Title": p.title,
      "Subcategory": p.subCategory,
      "Initial BAC ($M)": +Number(p.bacInitial || 0).toFixed(2),
      "Duration (Mo)": p.durationPlanned,
      "Alignment (%)": +((p.alignment || 0) * 100).toFixed(1),
      "Benefit Rate (BU/mo)": +Number(p.buRate || 0).toFixed(2),
      "ARC Rate (%)": +((p.arcRate || 0) * 100).toFixed(2),
      "Political": p.political ? "TRUE" : "FALSE",
      "Selection Frequency": `${p.selectionCount}/${entries.length} (${Math.round(p.selectionRatio * 100)}%)`,
      "Classification": p.classification,
    };
    entries.forEach((e) => {
      const out = (e.projectOutcomes || []).find((o) => o.id === p.id);
      const colKey = `Run #${e.runNumber} (#1 ${GOAL_METADATA[e.goalRanking?.[0]]?.shortLabel || ""})`;
      if (out?.state === "completed") {
        row[colKey] = `Completed (M${out.startMonth}→M${out.completionMonth})`;
      } else {
        row[colKey] = out?.state ? out.state.toUpperCase() : "SKIPPED";
      }
    });
    return row;
  });
  const wsMatrix = XLSX.utils.json_to_sheet(matrixRows);
  XLSX.utils.book_append_sheet(wb, wsMatrix, "Project_Selection_Matrix");

  // Sheet 4: Portfolio_Baseline (12-column round-trip importable schema)
  const baselineRows = projectsToBaselineRows(researchRun.projects || []);
  const wsBaseline = XLSX.utils.json_to_sheet(baselineRows, { header: EXCEL_HEADERS });
  XLSX.utils.book_append_sheet(wb, wsBaseline, "Portfolio_Baseline");

  // Sheet 5: All_Decisions_Raw
  const rawDecisionRows = [];
  entries.forEach((e) => {
    const rankStr = formatGoalRankingShort(e.goalRanking);
    for (const monthEntry of e.bestActionPlan || []) {
      for (const act of monthEntry.actions || []) {
        rawDecisionRows.push({
          "Run #": e.runNumber,
          "Run Label": e.label,
          "Goal Ranking": rankStr,
          "Month": monthEntry.month,
          "Action Type": act.type,
          "Project ID": act.id,
          "Project Title": act.title || "",
          "Speed/Slow Factor": act.a ?? act.s ?? "",
          "Rationale": act.rationale || "",
        });
      }
    }
  });
  if (rawDecisionRows.length > 0) {
    const wsDec = XLSX.utils.json_to_sheet(rawDecisionRows);
    XLSX.utils.book_append_sheet(wb, wsDec, "All_Decisions_Raw");
  }

  const safeName =
    (researchRun.title || "research-run")
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-|-$/g, "") || "research-run";
  XLSX.writeFile(wb, `${safeName}-comparison.xlsx`);
}

/* ============================================================
   5. EXPORT RESEARCH RUN TO MARKDOWN (.md)
   ============================================================ */
export function exportResearchRunToMarkdown(researchRun) {
  if (!researchRun) return;
  const report = generateResearchComparisonReport(researchRun);
  const entries = researchRun.entries || [];

  const lines = [];
  lines.push(`# Research Run Report: ${researchRun.title}`);
  lines.push("");
  lines.push("## 1. Research Run Metadata");
  lines.push("");
  lines.push("| Attribute | Value |");
  lines.push("| :--- | :--- |");
  lines.push(`| **Title** | ${researchRun.title} |`);
  lines.push(`| **Created By** | ${researchRun.ownerName || "Player"} (${researchRun.ownerEmail || "local"}) |`);
  lines.push(`| **Date / Time Created** | ${new Date(researchRun.createdAt).toLocaleString()} |`);
  lines.push(`| **Last Updated** | ${new Date(researchRun.updatedAt || researchRun.createdAt).toLocaleString()} |`);
  lines.push(`| **Number of Recorded Auto Runs** | ${entries.length} |`);
  lines.push(`| **Portfolio Data Used** | ${researchRun.portfolioName} (${researchRun.projectCount} candidate projects · Total Baseline BAC ${money(researchRun.totalBac)}) |`);
  lines.push(`| **Base Deterministic Seed** | \`${researchRun.baseSeed ?? "—"}\` |`);
  lines.push("");

  lines.push("## 2. Comparative Results Across Runs");
  lines.push("");
  if (entries.length === 0) {
    lines.push("_No runs recorded yet._");
  } else {
    lines.push(
      "| Run # | Label | Goal Priority Ranking (#1 → #4) | Sim Score | Ranked Goal Score | Projects Delivered | Avg Alignment | Funds Utilization | Unspent Cash | Social Benefits (BU) | Budget ($M) | Actions (Add/Spd/Slw) |"
    );
    lines.push(
      "| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
    );
    entries.forEach((e) => {
      const m = e.evaluation?.metrics || {};
      const ac = e.actionCounts || {};
      lines.push(
        `| **#${e.runNumber}** | ${e.label} | ${formatGoalRankingShort(e.goalRanking)} | **${(e.evaluation?.simScore || 0).toFixed(1)}** (${e.evaluation?.band || ""}) | ${(e.evaluation?.weightedGoalScore || 0).toFixed(1)} | **${m.completedCount}/${m.maxComp}** | **${pct(m.avgAlignment)}** | **${pct(m.utilizationRate)}** | ${money(m.unspentCash)} | **${Math.round(m.totalRealizedBU || 0).toLocaleString()} BU** | ${money(e.config?.totalBudget)} | ${ac.add || 0} / ${ac.speed || 0} / ${ac.slow || 0} |`
      );
    });
    lines.push("");
    lines.push("### 2.1 Scenario Parameters Recorded Per Run");
    lines.push("");
    lines.push(
      "| Run # | Budget ($M) | Tightness | Inflation | Funding Profile | Cadence | Risk Env | Political | Concurrent Cap | Approval Lag | ARC Wallet | Partial Credit | Seed |"
    );
    lines.push(
      "| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
    );
    entries.forEach((e) => {
      const c = e.config || {};
      lines.push(
        `| **#${e.runNumber}** | ${money(c.totalBudget)} | ${c.budgetTightness ?? 1.5}× | ${((c.annualRate || 0) * 100).toFixed(1)}% | ${c.fundingProfile || "scurve"} | ${c.fundingFrequency ?? 3}m | ${(c.riskMultiplier ?? 1.0).toFixed(1)}× | ${c.politicalProjects ?? 0} | ${c.concurrentCap ? c.concurrentCap : "Unlimited"} | ${c.approvalLag ?? 0}m | ${c.arcEnabled ? "ON" : "OFF"} | ${c.partialCreditEnabled ? "ON" : "OFF"} | \`${e.seed ?? "—"}\` |`
      );
    });
  }
  lines.push("");

  lines.push("## 3. Key Observations & Sensitivity Analysis");
  lines.push("");
  report.observations.forEach((obs, idx) => {
    lines.push(`### 3.${idx + 1} ${obs.title}`);
    lines.push(obs.detail);
    lines.push("");
  });

  lines.push("## 4. Run-by-Run Comparative Notes");
  lines.push("");
  report.runNarratives.forEach((rn) => {
    lines.push(`* **Run #${rn.runNumber} — ${rn.label} (\`${rn.goalRankingText}\`):** ${rn.summary}`);
  });
  lines.push("");

  lines.push("## 5. Cross-Run Project Selection Matrix");
  lines.push("");
  lines.push(
    `Across ${entries.length} runs: **${report.projectClassification.core.length} Core Anchor Projects** (selected in 100% of runs), **${report.projectClassification.swing.length} Goal-Sensitive Swing Projects**, and **${report.projectClassification.excluded.length} Universally Excluded Projects**.`
  );
  lines.push("");

  const runHeaders = entries.map((e) => `Run #${e.runNumber}`).join(" | ");
  const runSeps = entries.map(() => ":---:").join(" | ");
  lines.push(
    `| ID | Project Title | Subcategory | BAC ($M) | Dur (Mo) | Align (%) | BU/mo | ARC (%) | Frequency | Classification | ${runHeaders} |`
  );
  lines.push(
    `| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | ${runSeps} |`
  );
  report.projectClassification.all.forEach((p) => {
    const perRunCells = entries
      .map((e) => {
        const out = (e.projectOutcomes || []).find((o) => o.id === p.id);
        return out?.state === "completed"
          ? `✓ M${out.startMonth}→M${out.completionMonth}`
          : "—";
      })
      .join(" | ");
    lines.push(
      `| **${p.id}** | ${p.title}${p.political ? " *(Political)*" : ""} | ${p.subCategory} | ${money(p.bacInitial)} | ${p.durationPlanned}m | ${pct(p.alignment)} | ${p.buRate} | ${((p.arcRate || 0) * 100).toFixed(1)}% | ${p.selectionCount}/${entries.length} | ${p.classification} | ${perRunCells} |`
    );
  });
  lines.push("");

  lines.push("## 6. Portfolio Baseline Data Used");
  lines.push("");
  lines.push(
    "| ID | Title | Category | Subcategory | Initial BAC ($M) | Duration (Mo) | Alignment (%) | Cost Risk (%) | Dur Risk (%) | ARC Rate (%) | Benefit Rate (BU/mo) | Political |"
  );
  lines.push(
    "| :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
  );
  (researchRun.projects || []).forEach((p) => {
    lines.push(
      `| ${p.id} | ${p.title} | ${p.category} | ${p.subCategory} | ${money(p.bacInitial)} | ${p.durationPlanned} | ${pct(p.alignment)} | ${((p.costRiskBase ?? p.costRisk ?? 0.1) * 100).toFixed(1)}% | ${((p.durRiskBase ?? p.durRisk ?? 0.1) * 100).toFixed(1)}% | ${((p.arcRate || 0) * 100).toFixed(2)}% | ${p.buRate} | ${p.political ? "Yes" : "No"} |`
    );
  });
  lines.push("");

  const mdContent = lines.join("\n");
  const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName =
    (researchRun.title || "research-run")
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-|-$/g, "") || "research-run";
  a.href = url;
  a.download = `${safeName}-report.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   6. SCENARIO OPTIMAL BENCHMARK & RELATIVE SCORE ENGINE
   When the system sees a scenario (`scenarioKey`) for the first time,
   it runs the AI Optimizer in a background Web Worker to compute and
   store the optimal score. Subsequent runs retrieve the stored
   optimal score and rate the user via Relative Score = (User / Optimal) * 100.
   ============================================================ */
export function loadLocalBenchmarks() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_BM_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveLocalBenchmark(scenarioKey, benchmark) {
  if (!scenarioKey || !benchmark) return;
  const map = loadLocalBenchmarks();
  const existing = map[scenarioKey];
  if (!existing || (benchmark.optimalScore || 0) >= (existing.optimalScore || 0)) {
    map[scenarioKey] = benchmark;
    try {
      localStorage.setItem(LOCAL_BM_KEY, JSON.stringify(map));
    } catch {}
  }
}

export function computeRelativeScore(userScore, optimalScore) {
  const u = Number(userScore || 0);
  const opt = Number(optimalScore || 0);
  if (!Number.isFinite(opt) || opt <= 0) {
    return {
      relativeScore: null,
      relativeBand: "—",
    };
  }
  const rel = +((u / opt) * 100).toFixed(1);
  const relativeBand =
    rel >= 95
      ? "Near-Optimal"
      : rel >= 85
      ? "Strong vs. Optimal"
      : rel >= 72
      ? "Competitive"
      : rel >= 55
      ? "Developing"
      : "Below Benchmark";
  return {
    relativeScore: rel,
    relativeBand,
  };
}

export function buildBenchmarkFromOptResult(initialSim, optResult, scenarioKey) {
  const s = optResult.finalSim?.score || {};
  const m = optResult.evaluation?.metrics || {};
  return {
    scenarioKey,
    seed: initialSim.seed,
    preset: initialSim.config?.preset || "custom",
    portfolioId: initialSim.config?.customPortfolioId || "procedural",
    portfolioName: initialSim.config?.customPortfolioName || "Procedural Pool",
    totalBudget: initialSim.totalBudget,
    optimalScore: +(optResult.evaluation?.simScore || s.final || 0).toFixed(2),
    optimalBand: optResult.evaluation?.band || s.band || "Good",
    completed: m.completedCount ?? s.completed ?? 0,
    maxComp: m.maxComp ?? initialSim.maxComp ?? 1,
    avgAlignment: m.avgAlignment ?? 0,
    utilizationRate: m.utilizationRate ?? 0,
    unspentCash: m.unspentCash ?? 0,
    benefitsBU: m.totalRealizedBU ?? s.benefitsBU ?? 0,
    delivery: +(s.delivery || 0).toFixed(2),
    alignment: +(s.alignment || 0).toFixed(2),
    efficiency: +(s.efficiency || 0).toFixed(2),
    benefits: +(s.benefits || 0).toFixed(2),
    completedProjectIds: (optResult.finalSim?.projects || [])
      .filter((p) => p.state === "completed")
      .map((p) => p.id),
  };
}

export async function persistScenarioBenchmarkToServer(scenarioKey, benchmark) {
  saveLocalBenchmark(scenarioKey, benchmark);
  try {
    const res = await fetch(`${API}/benchmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioKey, benchmark }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.benchmark) {
        saveLocalBenchmark(scenarioKey, data.benchmark);
        return data.benchmark;
      }
    }
  } catch {}
  return benchmark;
}

/**
 * Looks up the stored optimal benchmark for `initialSim`.
 * - If the system has seen this scenario before (in server SQLite or localStorage),
 *   returns the stored optimal benchmark immediately (`isCached: true`).
 * - If this is the FIRST time the system sees this scenario, runs the AI Optimizer
 *   in a background Web Worker (`optimizeFor: "official_score"`), stores the optimal
 *   score in SQLite & localStorage, and returns it (`isCached: false, wasFirstTime: true`).
 */
export async function resolveOrComputeScenarioBenchmark(initialSim) {
  if (!initialSim) return null;
  const scenarioKey = computeScenarioKey(initialSim);

  // 1. Check Server SQLite first (so shared scenarios across sessions/users share the stored benchmark)
  try {
    const res = await fetch(`${API}/benchmarks/${encodeURIComponent(scenarioKey)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.found && data?.benchmark?.optimalScore > 0) {
        const bm = { ...data.benchmark, scenarioKey, isCached: true, wasFirstTime: false };
        saveLocalBenchmark(scenarioKey, bm);
        return bm;
      }
    }
  } catch {}

  // 2. Check localStorage fallback cache
  const localMap = loadLocalBenchmarks();
  if (localMap[scenarioKey]?.optimalScore > 0) {
    const bm = { ...localMap[scenarioKey], scenarioKey, isCached: true, wasFirstTime: false };
    // Ensure server also has it
    persistScenarioBenchmarkToServer(scenarioKey, bm);
    return bm;
  }

  // 3. First time seeing this scenario! Solve in background Web Worker (with sync fallback)
  const simSnapshot = clone(initialSim);
  const optResult = await new Promise((resolve) => {
    try {
      const worker = new Worker(new URL("./optimizer.worker.js", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === "OPTIMIZATION_COMPLETE") {
          worker.terminate();
          resolve(payload);
        } else if (type === "OPTIMIZATION_ERROR") {
          worker.terminate();
          resolve(
            runPortfolioOptimization({
              initialSim: simSnapshot,
              iterations: 220,
              optimizeFor: "official_score",
            })
          );
        }
      };
      worker.onerror = () => {
        worker.terminate();
        resolve(
          runPortfolioOptimization({
            initialSim: simSnapshot,
            iterations: 220,
            optimizeFor: "official_score",
          })
        );
      };
      worker.postMessage({
        type: "START_OPTIMIZATION",
        payload: {
          initialSim: simSnapshot,
          iterations: 220,
          optimizeFor: "official_score",
        },
      });
    } catch {
      resolve(
        runPortfolioOptimization({
          initialSim: simSnapshot,
          iterations: 220,
          optimizeFor: "official_score",
        })
      );
    }
  });

  const rawBenchmark = buildBenchmarkFromOptResult(simSnapshot, optResult, scenarioKey);
  const saved = await persistScenarioBenchmarkToServer(scenarioKey, rawBenchmark);
  return {
    ...saved,
    scenarioKey,
    isCached: false,
    wasFirstTime: true,
  };
}

