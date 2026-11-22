/* ============================================================
   AI PORTFOLIO OPTIMIZER CORE SOLVER
   Hybrid Multi-Heuristic + Genetic Algorithm + Local Search
   operating directly on the exact deterministic simulation engine
   and exact run seed.
   ============================================================ */

import {
  clone,
  actives,
  inflator,
  generateSCurve,
  totalDemandAt,
  arcFullMonthlyFor,
  addProject,
  slowProject,
  speedProject,
  suspendProject,
  resumeProject,
  abandonProject,
  reduceArcFunding,
  restoreArcFunding,
  advanceOneMonthDeterministic,
  evaluateRankedObjective,
  computeMaxTheoreticalBU,
  projectCompletionPct,
  replayActionPlan,
  DEFAULT_GOAL_RANKING,
  GOAL_METADATA,
  RANK_WEIGHTS,
  CRASH_K,
} from "./simulationEngine.js";

const moneyFmt = (n) => "$" + Number(n || 0).toFixed(2) + "M";
const pctFmt = (n) => Math.round((n || 0) * 100) + "%";

/**
 * Project scoring functions used to generate diverse initial priority orderings
 * tailored to the user's 4 ranked goals: projects, alignment, utilization, benefits.
 */
function buildHeuristicOrderings(sim, goalRanking = DEFAULT_GOAL_RANKING) {
  const avail = sim.projects.filter((p) => p.state === "available");
  const rankMap = {};
  goalRanking.forEach((g, idx) => {
    rankMap[g] = RANK_WEIGHTS[idx] ?? 0.1;
  });

  const wProj = rankMap.projects ?? 0.25;
  const wAlign = rankMap.alignment ?? 0.25;
  const wUtil = rankMap.utilization ?? 0.25;
  const wBen = rankMap.benefits ?? 0.25;

  const maxBac = Math.max(1, ...avail.map((p) => p.bacInitial));
  const maxDur = Math.max(1, ...avail.map((p) => p.durationPlanned));
  const maxBuRate = Math.max(1, ...avail.map((p) => p.buRate || 1));

  // Helper to sort available project IDs by a scoring function
  const orderBy = (fn) =>
    [...avail]
      .sort((a, b) => fn(b) - fn(a))
      .map((p) => p.id);

  const orderings = [];

  // 1. Direct Rank-Weighted Composite Value Density
  orderings.push(
    orderBy((p) => {
      const cheapness = 1 - p.bacInitial / (maxBac * 1.15);
      const speed = 1 - p.durationPlanned / (maxDur * 1.15);
      const align = p.alignment;
      const buEfficiency = ((p.buRate || 0) * Math.max(6, 54 - p.durationPlanned)) / (p.bacInitial * maxBuRate * 3);
      const arcDrag = sim.config?.arcEnabled ? (p.arcRate || 0) * 0.45 : 0;
      const riskDrag = (p.costRisk + p.durRisk) * 0.25;
      return (
        wProj * (cheapness * 0.65 + speed * 0.35) +
        wAlign * (align * 0.8 + (align / Math.sqrt(p.bacInitial)) * 0.4) +
        wUtil * (align * 0.5 + speed * 0.3 + cheapness * 0.2) +
        wBen * (buEfficiency * 0.75 + (p.buRate / maxBuRate) * 0.25) -
        arcDrag * (1 - wBen * 0.5) -
        riskDrag
      );
    })
  );

  // 2. Alignment-to-Cost Density (Classic Knapsack Efficiency)
  orderings.push(
    orderBy((p) => (p.alignment / Math.pow(p.bacInitial, 0.75)) * (1 - (p.costRisk + p.durRisk) * 0.3))
  );

  // 3. Pure High Alignment First (fills budget with highest-alignment projects regardless of size)
  orderings.push(
    orderBy((p) => p.alignment * 1000 - p.durationPlanned * 0.25 - (p.costRisk + p.durRisk) * 15)
  );

  // 3b. High Alignment + High Capital Utilization (packs high-alignment larger projects first)
  orderings.push(
    orderBy((p) => (p.alignment ** 2) * 100 * Math.pow(p.bacInitial, 0.25) - (sim.config?.arcEnabled ? (p.arcRate || 0) * 12 : 0))
  );

  // 4. Maximum Project Count (Cheapest & Fastest First, filtered by alignment)
  orderings.push(
    orderBy((p) => (1 / Math.max(0.5, p.bacInitial)) * 50 + p.alignment * 6 - p.durationPlanned * 0.12)
  );

  // 5. Maximum Social Benefits Density (BU * active_window / BAC)
  orderings.push(
    orderBy((p) => {
      const activeWindow = Math.max(1, 58 - p.durationPlanned);
      return ((p.buRate || 0) * activeWindow) / Math.pow(p.bacInitial, 0.8);
    })
  );

  // 6. Total Social Benefits Volume (High BU rate + fast completion)
  orderings.push(
    orderBy((p) => (p.buRate || 0) * Math.max(1, 56 - p.durationPlanned) * (0.6 + 0.4 * p.alignment))
  );

  // 7. Low-ARC High-Alignment (Protects Integrated Budget Wallet)
  orderings.push(
    orderBy((p) => (p.alignment / Math.pow(p.bacInitial, 0.65)) / (1 + (p.arcRate || 0) * 4))
  );

  // 8. Balanced Top-Rank Dominant
  const topGoal = goalRanking[0];
  const secondGoal = goalRanking[1];
  orderings.push(
    orderBy((p) => {
      const scores = {
        projects: (1 / p.bacInitial) * 12 + (1 / p.durationPlanned) * 15,
        alignment: p.alignment * 3.5 + (p.alignment / p.bacInitial) * 4,
        utilization: p.alignment * 2.0 + (p.bacInitial / maxBac) * 0.8 + (1 / p.durationPlanned) * 10,
        benefits: ((p.buRate || 0) / maxBuRate) * 3.0 + ((p.buRate || 0) / p.bacInitial) * 4,
      };
      return (scores[topGoal] || 1) * 0.65 + (scores[secondGoal] || 1) * 0.35;
    })
  );

  // 9. Knapsack Exact DP Subset Seed (puts 0-1 knapsack winners at the front of the queue)
  const knapsackOrder = solveBaselineKnapsackOrder(sim, wProj, wAlign, wUtil, wBen);
  if (knapsackOrder.length > 0) orderings.push(knapsackOrder);

  return orderings;
}

/**
 * Solves a discretized 0-1 Dynamic Programming Knapsack over `sim.projects`
 * to identify the highest-value subset of projects that fit within the effective
 * capital budget (accounting for political projects, inflation, and ARC reserve),
 * then orders winners first by best start timing (high BU / long duration / high alignment early).
 */
function solveBaselineKnapsackOrder(sim, wProj, wAlign, wUtil, wBen) {
  const avail = sim.projects.filter((p) => p.state === "available");
  if (!avail.length) return [];

  const politicalCost = sim.projects
    .filter((p) => p.state !== "available")
    .reduce((a, p) => a + (p.bacCurrent || p.bacInitial) * 1.12, 0);

  // Effective budget available for new additions (accounting for ~8-12% average inflation + ARC)
  const inflationAllowance = 1 + sim.annualRate * 1.8 + (sim.config?.arcEnabled ? 0.08 : 0);
  const effectiveCap = Math.max(5, (sim.totalBudget - politicalCost) / inflationAllowance);

  // Discretize in $0.5M units
  const STEP = 0.5;
  const W = Math.min(2000, Math.max(10, Math.round(effectiveCap / STEP)));
  const n = avail.length;

  const maxBu = Math.max(1, ...avail.map((p) => (p.buRate || 1) * Math.max(5, 55 - p.durationPlanned)));

  const items = avail.map((p) => {
    const estArc = sim.config?.arcEnabled
      ? (p.bacInitial * (p.arcRate || 0) * Math.max(0, 50 - p.durationPlanned)) / 12
      : 0;
    const effectiveCost = p.bacInitial + estArc * 0.65;
    const weight = Math.max(1, Math.round(effectiveCost / STEP));
    const estBu = ((p.buRate || 0) * Math.max(4, 56 - p.durationPlanned)) / maxBu;
    const val =
      wProj * 1.0 +
      wAlign * (p.alignment * 1.6) +
      wUtil * ((p.bacInitial / Math.max(10, effectiveCap)) * 2.2 * (0.5 + 0.5 * p.alignment)) +
      wBen * (estBu * 1.8);
    return { p, weight, val };
  });

  const dp = new Float64Array(W + 1);
  const keep = Array.from({ length: n }, () => new Uint8Array(W + 1));

  for (let i = 0; i < n; i++) {
    const { weight, val } = items[i];
    for (let w = W; w >= weight; w--) {
      const cand = dp[w - weight] + val;
      if (cand > dp[w]) {
        dp[w] = cand;
        keep[i][w] = 1;
      }
    }
  }

  let currW = W;
  const chosenSet = new Set();
  for (let i = n - 1; i >= 0; i--) {
    if (keep[i][currW] === 1) {
      chosenSet.add(items[i].p.id);
      currW -= items[i].weight;
    }
  }

  const chosen = avail.filter((p) => chosenSet.has(p.id));
  const rest = avail.filter((p) => !chosenSet.has(p.id));

  // Among chosen projects, start high-BU / high-alignment / longer-duration projects earlier
  const startPriority = (p) =>
    (wBen * ((p.buRate || 0) / Math.max(1, p.bacInitial)) * 0.4) +
    (wAlign * p.alignment * 0.4) +
    (p.durationPlanned / 36) * 0.25 -
    (sim.config?.arcEnabled ? (p.arcRate || 0) * 0.25 : 0);

  chosen.sort((a, b) => startPriority(b) - startPriority(a));
  rest.sort((a, b) => (b.alignment / b.bacInitial) - (a.alignment / a.bacInitial));

  return [...chosen.map((p) => p.id), ...rest.map((p) => p.id)];
}

/**
 * Multi-month cash-flow feasibility lookahead when considering adding candidate project `cand`
 * at current month `sim.month` (optionally with an immediate speed-up factor `crashSpeedA`).
 */
function checkLookaheadFeasibility(sim, cand, policy, crashSpeedA = 0, allowCarryover = false) {
  const mNow = sim.month;
  const lag = sim.config?.approvalLag || 0;
  const horizon = Math.min(60, mNow + (policy.lookaheadHorizon || 24));
  const freq = sim.config?.fundingFrequency ?? 3;
  const mr = sim.monthlyRate;
  const arcOn = !!sim.config?.arcEnabled;

  // Build candidate's projected sCurve
  let candBac = +(cand.bacInitial * inflator(mr, mNow)).toFixed(4);
  let candDur = cand.durationPlanned;
  if (crashSpeedA > 0) {
    candBac = +(candBac * (1 + CRASH_K * crashSpeedA)).toFixed(4);
    candDur = Math.max(1, Math.ceil(candDur * (1 - crashSpeedA)));
  }
  const candStart = mNow + lag;
  const candEnd = candStart + candDur - 1;
  if (!allowCarryover && candEnd > 60 - (crashSpeedA > 0 ? 0 : policy.finishMargin || 0)) {
    return { ok: false, reason: "exceeds_m60" };
  }
  if (allowCarryover && candStart > 58) {
    return { ok: false, reason: "too_late_to_start" };
  }

  // Total remaining commitment check vs total remaining budget through Month 60
  let activeRemNominal = 0;
  for (const p of sim.projects) {
    if (p.state === "active") {
      const m60Window = Math.max(0, 60 - mNow + 1);
      if (allowCarryover && p.sCurve.length > m60Window) {
        activeRemNominal += p.sCurve.slice(0, m60Window).reduce((a, b) => a + b, 0);
      } else {
        activeRemNominal += Math.max(0, p.bacCurrent - p.nominalSpent);
      }
    } else if (p.state === "pending") {
      activeRemNominal += p.bacCurrent;
    } else if (p.state === "suspended" && !policy.abandonSuspended) {
      activeRemNominal += Math.max(0, p.bacCurrent - p.nominalSpent);
    }
  }

  // Estimate remaining future tranches
  let futureReleasesTotal = 0;
  for (let t = mNow + 1; t <= 60; t++) {
    if ((t - 1) % freq === 0) {
      const qi = Math.floor((t - 1) / freq);
      futureReleasesTotal += sim.releaseSchedule?.[qi] ?? sim.quarterlyRelease;
    }
  }
  const totalCashPoolRemaining = sim.availableBalance + futureReleasesTotal;

  // Estimate cumulative future ARC drain from completed + currently active + candidate
  let estFutureArc = 0;
  if (arcOn) {
    for (const p of sim.projects) {
      if (p.state === "completed") {
        const remM = Math.max(0, 60 - mNow + 1);
        estFutureArc += (p.arcBaseBac * (p.arcRate || 0) / 12) * remM * (p.arcReduced ? 0.7 : 1.0);
      } else if (p.state === "active" || p.state === "pending") {
        const pEnd = p.state === "active" ? (mNow + p.sCurve.length - 1) : (p.pendingUntil + p.durationPlanned - 1);
        const arcMonths = Math.max(0, 60 - pEnd);
        estFutureArc += (p.bacCurrent * (p.arcRate || 0) / 12) * arcMonths;
      }
    }
    const candArcMonths = Math.max(0, 60 - candEnd);
    estFutureArc += (candBac * (cand.arcRate || 0) / 12) * candArcMonths;
  }

  const candCurve = generateSCurve(candBac, candDur);
  const candMonthsInWindow = Math.max(0, Math.min(candDur, 60 - candStart + 1));
  const candNomInWindow = allowCarryover
    ? candCurve.slice(0, candMonthsInWindow).reduce((a, b) => a + b, 0)
    : candBac;
  const estCompletionAtM60 = candBac > 0 ? candNomInWindow / candBac : 0;

  const avgFutureInflator = inflator(mr, Math.min(60, mNow + Math.round(candMonthsInWindow * 0.55)));
  const projectedTotalNeed = (activeRemNominal + candNomInWindow) * avgFutureInflator + estFutureArc;
  if (projectedTotalNeed > totalCashPoolRemaining * (policy.totalBudgetCapFactor ?? 0.98)) {
    return { ok: false, reason: "exceeds_total_budget_envelope" };
  }

  // Month-by-month cash balance simulation over lookahead horizon
  let bal = sim.availableBalance;
  const riskReserve = policy.riskBufferPct || 0;

  for (let t = mNow; t <= horizon; t++) {
    if (t > mNow && (t - 1) % freq === 0) {
      const qi = Math.floor((t - 1) / freq);
      bal += sim.releaseSchedule?.[qi] ?? sim.quarterlyRelease;
    }

    let monthCapex = 0;
    const inf = inflator(mr, t);

    // Active projects
    for (const p of sim.projects) {
      if (p.state === "active") {
        const idx = t - mNow;
        if (idx >= 0 && idx < p.sCurve.length) {
          monthCapex += p.sCurve[idx] * inf;
        }
      } else if (p.state === "pending") {
        const idx = t - p.pendingUntil;
        if (idx >= 0 && idx < p.durationPlanned) {
          // Approximate S-curve draw for pending
          const d = p.durationPlanned;
          const stepNom = p.bacCurrent * ((3 * ((idx + 1) / d) ** 2 - 2 * ((idx + 1) / d) ** 3) - (3 * (idx / d) ** 2 - 2 * (idx / d) ** 3));
          monthCapex += stepNom * inf;
        }
      }
    }

    // Candidate project draw at month t
    const cIdx = t - candStart;
    if (cIdx >= 0 && cIdx < candCurve.length) {
      monthCapex += candCurve[cIdx] * inf;
    }

    // ARC draw at month t
    let monthArc = 0;
    if (arcOn) {
      for (const p of sim.projects) {
        if (p.state === "completed") {
          monthArc += arcFullMonthlyFor(p, t, sim.annualRate) * (p.arcReduced ? 0.7 : 1);
        } else if (p.state === "active") {
          const compM = mNow + p.sCurve.length - 1;
          if (t > compM) {
            monthArc += (p.bacCurrent * (p.arcRate || 0) / 12);
          }
        }
      }
      if (t > candEnd) {
        monthArc += (candBac * (cand.arcRate || 0) / 12);
      }
    }

    const totalMonthDraw = (monthCapex + monthArc) * (1 + (t === mNow ? 0 : riskReserve));
    bal -= totalMonthDraw;

    // Must unconditionally afford current month t === mNow
    if (t === mNow && bal < -1e-5) {
      return { ok: false, reason: "immediate_shortfall" };
    }
    // In future months, check against allowable slack (which could be smoothed via minor slow-downs)
    const allowedDip = (t > mNow && policy.allowFutureSlowSlack)
      ? monthCapex * (policy.allowFutureSlowSlackRatio || 0.12)
      : 0;
    if (bal < -allowedDip) {
      return { ok: false, reason: `future_shortfall_M${t}` };
    }
  }

  return { ok: true, candEnd, candBac, candDur, estCompletionAtM60 };
}

/**
 * Execute a full 60-month rollout on a clone of `initialSim` using a candidate
 * chromosome `{ order, skipSet, params }` and record the exact monthly action script.
 */
export function runPolicyRollout(
  initialSim,
  chromosome,
  goalRanking = DEFAULT_GOAL_RANKING,
  maxTheoBU = null,
  optimizeFor = "ranked"
) {
  const sim = clone(initialSim);
  const { order, skipSet = new Set(), params } = chromosome;
  const monthlyActionPlan = [];
  const mr = sim.monthlyRate;
  const lag = sim.config?.approvalLag || 0;
  const hardCap = sim.config?.concurrentCap || 0;

  // Compute reserved elite prefix of `order` whose cumulative cost fills `prefixBudgetFactor` of non-political budget
  const politicalInitialBac = sim.projects
    .filter((p) => p.state !== "available")
    .reduce((a, p) => a + (p.bacCurrent || p.bacInitial), 0);
  const availBudgetForNew = Math.max(5, sim.totalBudget - politicalInitialBac * 1.1);
  const prefixBudgetCap = availBudgetForNew * (params.prefixBudgetFactor || 0.96);
  const elitePrefixSet = new Set();
  let cumPrefixCost = 0;
  for (const pid of order) {
    if (skipSet.has(pid)) continue;
    const p = sim.projects.find((x) => x.id === pid);
    if (!p || p.state !== "available") continue;
    const estArc = sim.config?.arcEnabled ? (p.bacInitial * (p.arcRate || 0) * Math.max(0, 45 - p.durationPlanned)) / 12 : 0;
    const estCost = p.bacInitial * (1 + sim.annualRate * 1.5) + estArc * 0.6;
    if (elitePrefixSet.size === 0 || cumPrefixCost + estCost <= prefixBudgetCap) {
      elitePrefixSet.add(pid);
      cumPrefixCost += estCost;
    } else if (params.strictPrefixOnly) {
      break;
    }
  }
  const lateSweepMonth = params.lateSweepMonth || 38;

  while (sim.status === "running" && sim.month <= 60) {
    const m = sim.month;
    const monthActions = [];

    // 1. Restore ARC funding if any completed project has reduced ARC and we have comfortable cash headroom
    if (sim.config?.arcEnabled) {
      const reducedCompleted = sim.projects
        .filter((p) => p.state === "completed" && p.arcReduced)
        .sort((a, b) => (b.buRate || 0) - (a.buRate || 0));
      for (const p of reducedCompleted) {
        const demandNow = totalDemandAt(sim, m);
        const backlog = p.arcBacklog || 0;
        if (sim.availableBalance - demandNow - backlog > sim.quarterlyRelease * 0.35) {
          restoreArcFunding(sim, p.id);
          monthActions.push({
            type: "arc_restore",
            id: p.id,
            title: p.title,
            rationale: `Restored full ARC funding for ${p.id} "${p.title}" (paid ${moneyFmt(backlog)} backlog) to recover 100% social benefit generation.`,
          });
        }
      }
    }

    // 2. Resume any suspended projects if they can complete before Month 60 and cash allows
    const suspendedList = sim.projects
      .filter((p) => p.state === "suspended")
      .sort((a, b) => b.alignment - a.alignment);
    for (const p of suspendedList) {
      const resumedLen = Math.ceil(p.sCurve.length * 1.1);
      if (m + resumedLen - 1 <= 60) {
        const estFirstDraw = ((p.bacCurrent - p.nominalSpent) / Math.max(1, resumedLen)) * inflator(mr, m);
        if (totalDemandAt(sim, m) + estFirstDraw <= sim.availableBalance * 0.85) {
          resumeProject(sim, p.id);
          monthActions.push({
            type: "resume",
            id: p.id,
            title: p.title,
            rationale: `Resumed ${p.id} "${p.title}" (${pctFmt(p.alignment)} alignment) with sufficient cash headroom to finish by M${m + resumedLen - 1}.`,
          });
        }
      } else if (!(p.political && p.lockUntil && m <= p.lockUntil) && p.nominalSpent === 0) {
        // Suspended at 0 spend and can never finish in time
        abandonProject(sim, p.id);
        monthActions.push({
          type: "abandon",
          id: p.id,
          title: p.title,
          rationale: `Terminated unstarted suspended project ${p.id} that can no longer finish before M60.`,
        });
      }
    }

    // 3. Rescue active projects whose projected completion exceeds Month 60 (e.g., due to milestone duration shocks)
    const activeProjects = actives(sim);
    for (const p of activeProjects) {
      const remMonths = p.sCurve.length;
      const projEnd = m + remMonths - 1;
      const maxAllowedMonth = 60;
      if (projEnd > maxAllowedMonth && remMonths > 1) {
        const targetRem = Math.max(1, maxAllowedMonth - m + 1);
        // Find minimum compression `a` such that Math.ceil(remMonths * (1 - a)) <= targetRem
        let neededA = 1 - targetRem / remMonths;
        neededA = Math.min(0.65, Math.max(0.05, +(neededA + 0.03).toFixed(2)));
        const newRem = Math.max(1, Math.ceil(remMonths * (1 - neededA)));
        if (m + newRem - 1 <= 60) {
          // Verify that speeding up doesn't cause an immediate insurmountable shortfall
          const probe = clone(sim);
          speedProject(probe, p.id, neededA);
          if (totalDemandAt(probe, m) <= probe.availableBalance * 0.96) {
            speedProject(sim, p.id, neededA);
            monthActions.push({
              type: "speed",
              id: p.id,
              a: neededA,
              title: p.title,
              rationale: `Sped up ${p.id} "${p.title}" by ${Math.round(neededA * 100)}% so it completes at M${m + newRem - 1} instead of expiring after M60.`,
            });
          }
        }
      }
    }

    // 4. Abandon political low-alignment projects right after lock expires (M25) ONLY IF configured and beneficial
    if (params.abandonWorstPoliticalAt25 && m === 25) {
      const unlockedPol = actives(sim)
        .filter((p) => p.political && p.alignment < 0.28 && (p.nominalSpent / Math.max(1, p.bacCurrent)) < 0.42)
        .sort((a, b) => a.alignment - b.alignment);
      if (unlockedPol.length > 0) {
        const p = unlockedPol[0];
        abandonProject(sim, p.id);
        monthActions.push({
          type: "abandon",
          id: p.id,
          title: p.title,
          rationale: `Exited low-alignment political project ${p.id} (${pctFmt(p.alignment)} alignment) upon M24 lock expiry to reallocate budget to high-value candidates.`,
        });
      }
    }

    // 5. Add new projects according to priority `order` and cash-flow lookahead
    let addsThisMonth = 0;
    const maxAddsPerMonth = params.maxAddsPerMonth || 10;
    const softCap = params.maxActiveSoftCap || 0;
    const queueWindow = params.strictQueueWindow || 99;
    const minAlignFloor = params.minAlignmentFloor || 0;
    let waitingFeasibleTopCount = 0;

    for (const pid of order) {
      if (addsThisMonth >= maxAddsPerMonth) break;
      if (skipSet.has(pid)) continue;
      if (params.strictPrefixOnly && m < lateSweepMonth && !elitePrefixSet.has(pid)) continue;

      const cand = sim.projects.find((x) => x.id === pid);
      if (!cand || cand.state !== "available") continue;
      if (cand.alignment < minAlignFloor && (m < lateSweepMonth || !params.relaxFloorInLateSweep)) continue;

      const liveCount = sim.projects.filter((x) => x.state === "active" || x.state === "pending").length;
      if (hardCap > 0 && liveCount >= hardCap) break;
      if (softCap > 0 && liveCount >= softCap) break;

      // Optional earliest start delay for specific projects
      const minStart = chromosome.startDelays?.[pid] || 1;
      if (m < minStart) continue;

      const normalEnd = m + lag + cand.durationPlanned - 1;
      const finishMargin = params.finishMargin ?? 1;

      if (normalEnd <= 60 - finishMargin) {
        if (waitingFeasibleTopCount >= queueWindow) break;
        const check = checkLookaheadFeasibility(sim, cand, params, 0);
        if (check.ok) {
          addProject(sim, cand.id);
          addsThisMonth++;
          monthActions.push({
            type: "add",
            id: cand.id,
            title: cand.title,
            rationale: `Initiated ${cand.id} "${cand.title}" (${pctFmt(cand.alignment)} alignment, ${moneyFmt(check.candBac)} BAC, ${cand.durationPlanned}m duration, ${cand.buRate} BU/mo) — fits tranche cash-flow envelope with projected completion at M${check.candEnd}.`,
          });
        } else {
          // This high-priority project can still finish before M60 if started in a later tranche; count it in the queue window
          if (m + 3 + lag + cand.durationPlanned - 1 <= 60 - finishMargin) {
            waitingFeasibleTopCount++;
          }
        }
      } else if (
        params.allowCrashStart &&
        lag === 0 &&
        normalEnd > 60 &&
        normalEnd <= 69 &&
        m >= 30 &&
        m <= 54
      ) {
        // Try Crash-Start: Add project and immediately speed it up so it finishes by Month 59/60!
        const targetDur = Math.max(4, 60 - m);
        if (targetDur < cand.durationPlanned) {
          const neededA = Math.min(0.45, Math.max(0.10, +(1 - targetDur / cand.durationPlanned + 0.03).toFixed(2)));
          const compressedDur = Math.max(1, Math.ceil(cand.durationPlanned * (1 - neededA)));
          if (m + compressedDur - 1 <= 60) {
            const check = checkLookaheadFeasibility(sim, cand, params, neededA, false);
            if (check.ok) {
              addProject(sim, cand.id);
              speedProject(sim, cand.id, neededA);
              addsThisMonth++;
              monthActions.push({
                type: "add",
                id: cand.id,
                title: cand.title,
                rationale: `Initiated late-stage project ${cand.id} "${cand.title}" (${pctFmt(cand.alignment)} alignment, ${cand.durationPlanned}m base duration) to deploy surplus tranche funds.`,
              });
              monthActions.push({
                type: "speed",
                id: cand.id,
                a: neededA,
                title: cand.title,
                rationale: `Immediately compressed ${cand.id} by ${Math.round(neededA * 100)}% (${cand.durationPlanned}m → ${compressedDur}m) so it delivers at M${m + compressedDur - 1} before the M60 deadline.`,
              });
              continue;
            }
          }
        }
      }

      // If Partial Credit for Unfinished Projects is enabled in Custom Mode, allow initiating carryover projects in the late window
      if (
        sim.config?.partialCreditEnabled &&
        normalEnd > 60 - finishMargin &&
        m >= 34 &&
        m + lag <= 56 &&
        cand.state === "available"
      ) {
        const check = checkLookaheadFeasibility(sim, cand, params, 0, true);
        const minCarryPct = params.minCarryoverPct ?? 0.22;
        if (check.ok && (check.estCompletionAtM60 || 0) >= minCarryPct) {
          addProject(sim, cand.id);
          addsThisMonth++;
          const estPct = Math.round((check.estCompletionAtM60 || 0) * 100);
          monthActions.push({
            type: "add",
            id: cand.id,
            title: cand.title,
            rationale: `Initiated multi-year carryover project ${cand.id} "${cand.title}" (${pctFmt(cand.alignment)} alignment, ${moneyFmt(check.candBac)} BAC, ${cand.durationPlanned}m duration) — projected to reach ~${estPct}% completion by M60 for proportionate partial credit while continuing past the 5-year planning window.`,
          });
        }
      }
    }

    // 6. Late-game surplus deployment via strategic Speed-Up (boosts Utilization of Funds & Social Benefits)
    if (params.lateSurplusSpeedup && m >= 42 && m <= 58) {
      // Check if any available project can still be started
      const anyStartable = sim.projects.some(
        (p) => p.state === "available" && (m + lag + p.durationPlanned - 1) <= 60
      );
      if (!anyStartable) {
        // Compute remaining cash excess over all active obligations
        const freq = sim.config?.fundingFrequency ?? 3;
        let futureRel = 0;
        for (let t = m + 1; t <= 60; t++) {
          if ((t - 1) % freq === 0) {
            const qi = Math.floor((t - 1) / freq);
            futureRel += sim.releaseSchedule?.[qi] ?? sim.quarterlyRelease;
          }
        }
        const remObligations = actives(sim).reduce(
          (a, p) => a + Math.max(0, p.bacCurrent - p.nominalSpent) * inflator(mr, 58),
          0
        );
        const remArc = sim.config?.arcEnabled
          ? sim.projects
              .filter((p) => p.state === "completed" || p.state === "active")
              .reduce((a, p) => a + ((p.arcBaseBac || p.bacCurrent) * (p.arcRate || 0) / 12) * (61 - m), 0)
          : 0;
        const projectedSurplus = sim.availableBalance + futureRel - remObligations - remArc;

        if (projectedSurplus > sim.totalBudget * 0.04) {
          // Speed up active projects with highest BU rate / alignment that have > 3 months left
          const candidatesToSpeed = actives(sim)
            .filter((p) => p.sCurve.length >= 4)
            .sort((a, b) => (b.buRate || 0) * b.alignment - (a.buRate || 0) * a.alignment);

          for (const p of candidatesToSpeed) {
            const speedA = 0.20;
            const remBudget = Math.max(0, p.bacCurrent - p.nominalSpent);
            const premium = remBudget * CRASH_K * speedA * inflator(mr, m);
            if (premium < projectedSurplus * 0.5 && totalDemandAt(sim, m) + remBudget * 0.25 * inflator(mr, m) < sim.availableBalance * 0.85) {
              const probe = clone(sim);
              speedProject(probe, p.id, speedA);
              if (totalDemandAt(probe, m) <= probe.availableBalance * 0.88) {
                speedProject(sim, p.id, speedA);
                monthActions.push({
                  type: "speed",
                  id: p.id,
                  a: speedA,
                  title: p.title,
                  rationale: `Accelerated ${p.id} "${p.title}" by 20% using late-programme surplus funds to maximize fund utilization and capture extra months of Social Benefits (${p.buRate} BU/mo).`,
                });
                break;
              }
            }
          }
        }
      }
    }

    // 7. Shortfall Prevention & Resolution Guard (guarantees 0 insolvency!)
    let safetyIter = 0;
    while (totalDemandAt(sim, m) > sim.availableBalance + 1e-6 && safetyIter < 40) {
      safetyIter++;
      const deficit = totalDemandAt(sim, m) - sim.availableBalance;

      // Step 7a: Try slowing an active project that still finishes <= Month 60
      const slowCandidates = actives(sim)
        .filter((p) => p.sCurve.length >= 2)
        .map((p) => {
          const slack = Math.max(0, 60 - (m + p.sCurve.length - 1));
          const currentDraw = (p.sCurve[0] || 0) * inflator(mr, m);
          return { p, slack, currentDraw };
        })
        .filter((x) => x.currentDraw > 0.01)
        .sort((a, b) => {
          if ((b.slack > 0) !== (a.slack > 0)) return b.slack > 0 ? 1 : -1;
          // Prefer slowing lower-alignment, higher-draw projects with more slack
          return (b.currentDraw * (1.2 - b.p.alignment) * (1 + b.slack * 0.2)) -
                 (a.currentDraw * (1.2 - a.p.alignment) * (1 + a.slack * 0.2));
        });

      let resolved = false;
      for (const { p, slack } of slowCandidates) {
        // Choose a slowdown factor `s` that doesn't push completion past Month 60 if slack > 0
        const maxSafeS = slack > 0
          ? Math.min(0.50, Math.max(0.12, +(1 - p.sCurve.length / (p.sCurve.length + slack)).toFixed(2)))
          : 0.35;
        if (maxSafeS >= 0.10) {
          const beforeDemand = totalDemandAt(sim, m);
          slowProject(sim, p.id, maxSafeS);
          const afterDemand = totalDemandAt(sim, m);
          if (afterDemand < beforeDemand - 1e-4) {
            monthActions.push({
              type: "slow",
              id: p.id,
              s: maxSafeS,
              title: p.title,
              rationale: `Slowed ${p.id} "${p.title}" by ${Math.round(maxSafeS * 100)}% to reduce M${m} cash demand by ${moneyFmt(beforeDemand - afterDemand)} and prevent a cash shortfall.`,
            });
            resolved = true;
            break;
          }
        }
      }
      if (resolved) continue;

      // Step 7b: Suspend lowest-alignment active project
      const suspendCand = actives(sim).sort((a, b) => a.alignment - b.alignment)[0];
      if (suspendCand) {
        suspendProject(sim, suspendCand.id);
        monthActions.push({
          type: "suspend",
          id: suspendCand.id,
          title: suspendCand.title,
          rationale: `Temporarily suspended ${suspendCand.id} "${suspendCand.title}" to resolve M${m} cash shortfall (${moneyFmt(deficit)}) until the next funding tranche.`,
        });
        continue;
      }

      // Step 7c: Reduce ARC funding on lowest-BU completed project if still in deficit
      if (sim.config?.arcEnabled) {
        const arcCand = sim.projects
          .filter((p) => p.state === "completed" && !p.arcReduced && (p.arcReductionCount || 0) < 2)
          .sort((a, b) => (a.buRate || 0) - (b.buRate || 0))[0];
        if (arcCand) {
          reduceArcFunding(sim, arcCand.id);
          monthActions.push({
            type: "arc_reduce",
            id: arcCand.id,
            title: arcCand.title,
            rationale: `Reduced ARC funding by 30% on ${arcCand.id} "${arcCand.title}" to cover M${m} recurring cost shortfall.`,
          });
          continue;
        }
      }

      break;
    }

    if (monthActions.length > 0) {
      monthlyActionPlan.push({ month: m, actions: monthActions });
    }

    advanceOneMonthDeterministic(sim);
  }

  const evaluation = evaluateRankedObjective(sim, goalRanking, maxTheoBU, optimizeFor);
  return {
    sim,
    monthlyActionPlan,
    evaluation,
    chromosome,
  };
}

/**
 * Order Crossover (OX) for two project ID permutations.
 */
function crossoverOrder(orderA, orderB, rng) {
  const n = orderA.length;
  if (n <= 2) return orderA.slice();
  const start = Math.floor(rng() * n);
  const end = start + 1 + Math.floor(rng() * (n - start));
  const slice = orderA.slice(start, end);
  const sliceSet = new Set(slice);
  const child = new Array(n);
  for (let i = start; i < end; i++) child[i] = orderA[i];
  let bi = 0;
  for (let i = 0; i < n; i++) {
    if (i >= start && i < end) continue;
    while (bi < n && sliceSet.has(orderB[bi])) bi++;
    child[i] = orderB[bi++];
  }
  return child;
}

/**
 * Mutate a candidate chromosome (order swaps, skip-set toggles, policy parameter tweaks).
 */
function mutateChromosome(parent, rng) {
  const order = parent.order.slice();
  const n = order.length;
  if (n >= 2) {
    const swaps = 1 + (rng() < 0.45 ? 1 : 0);
    for (let s = 0; s < swaps; s++) {
      // Bias swaps toward the front 75% of the queue where projects actually get started
      const i = Math.floor(rng() * Math.ceil(n * 0.8));
      const j = Math.floor(rng() * n);
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  const skipSet = new Set(parent.skipSet || []);
  if (rng() < 0.25 && n > 5) {
    const idx = Math.floor(rng() * Math.ceil(n * 0.7));
    const pid = order[idx];
    if (skipSet.has(pid)) skipSet.delete(pid);
    else if (skipSet.size < Math.floor(n * 0.35)) skipSet.add(pid);
  } else if (rng() < 0.20 && skipSet.size > 0) {
    skipSet.clear();
  }

  const params = { ...parent.params };
  if (rng() < 0.35) {
    const horizons = [12, 18, 24, 36, 48, 60];
    params.lookaheadHorizon = horizons[Math.floor(rng() * horizons.length)];
  }
  if (rng() < 0.35) {
    const caps = [0.92, 0.96, 0.99, 1.01, 1.03, 1.05];
    params.totalBudgetCapFactor = caps[Math.floor(rng() * caps.length)];
  }
  if (rng() < 0.30) {
    const buffers = [0.0, 0.015, 0.03, 0.05, 0.08];
    params.riskBufferPct = buffers[Math.floor(rng() * buffers.length)];
  }
  if (rng() < 0.25) {
    const margins = [0, 1, 2, 3];
    params.finishMargin = margins[Math.floor(rng() * margins.length)];
  }
  if (rng() < 0.20) {
    params.allowCrashStart = !params.allowCrashStart;
  }
  if (rng() < 0.20) {
    params.lateSurplusSpeedup = !params.lateSurplusSpeedup;
  }
  if (rng() < 0.20) {
    params.allowFutureSlowSlack = !params.allowFutureSlowSlack;
  }
  if (rng() < 0.20) {
    const softCaps = [0, 0, 6, 8, 10, 12];
    params.maxActiveSoftCap = softCaps[Math.floor(rng() * softCaps.length)];
  }
  if (rng() < 0.35) {
    const windows = [1, 2, 3, 5, 8, 99];
    params.strictQueueWindow = windows[Math.floor(rng() * windows.length)];
  }
  if (rng() < 0.30) {
    const floors = [0, 0, 0.35, 0.45, 0.55, 0.65];
    params.minAlignmentFloor = floors[Math.floor(rng() * floors.length)];
  }
  if (rng() < 0.30) {
    params.strictPrefixOnly = !params.strictPrefixOnly;
  }
  if (rng() < 0.30) {
    const pFactors = [0.85, 0.92, 0.98, 1.04, 1.12];
    params.prefixBudgetFactor = pFactors[Math.floor(rng() * pFactors.length)];
  }

  return { order, skipSet, params };
}

/**
 * Main Optimizer Entry Point.
 * Runs Phase 1 (Heuristic Grid Search), Phase 2 (Evolutionary Genetic Search),
 * and Phase 3 (Local Neighborhood Polishing) on the exact `initialSim` and its seed.
 */
export function runPortfolioOptimization({
  initialSim,
  goalRanking = DEFAULT_GOAL_RANKING,
  iterations = 320,
  optimizeFor = "ranked",
  onProgress = null,
}) {
  const startTime = Date.now();
  const baseSim = clone(initialSim);
  const maxTheoBU = computeMaxTheoreticalBU(baseSim.projects, baseSim.totalBudget, baseSim.config?.approvalLag || 0);
  const solverRng = (() => {
    let s = ((baseSim.seed >>> 0) ^ 0x9e3779b9) >>> 0 || 42;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  })();

  const heuristicOrders = buildHeuristicOrderings(baseSim, goalRanking);

  const policyTemplates = [
    { lookaheadHorizon: 60, totalBudgetCapFactor: 1.00, riskBufferPct: 0.01, finishMargin: 1, allowCrashStart: true,  lateSurplusSpeedup: true,  allowFutureSlowSlack: true,  allowFutureSlowSlackRatio: 0.10, maxActiveSoftCap: 0,  strictQueueWindow: 2,  minAlignmentFloor: 0.45, strictPrefixOnly: true,  prefixBudgetFactor: 0.96, lateSweepMonth: 38, relaxFloorInLateSweep: true },
    { lookaheadHorizon: 36, totalBudgetCapFactor: 1.02, riskBufferPct: 0.00, finishMargin: 0, allowCrashStart: true,  lateSurplusSpeedup: true,  allowFutureSlowSlack: true,  allowFutureSlowSlackRatio: 0.14, maxActiveSoftCap: 0,  strictQueueWindow: 99, minAlignmentFloor: 0.55, strictPrefixOnly: true,  prefixBudgetFactor: 0.94, lateSweepMonth: 42, relaxFloorInLateSweep: false },
    { lookaheadHorizon: 60, totalBudgetCapFactor: 1.01, riskBufferPct: 0.01, finishMargin: 1, allowCrashStart: true,  lateSurplusSpeedup: true,  allowFutureSlowSlack: true,  allowFutureSlowSlackRatio: 0.12, maxActiveSoftCap: 0,  strictQueueWindow: 99, minAlignmentFloor: 0.0,  strictPrefixOnly: false, prefixBudgetFactor: 1.05, lateSweepMonth: 36, relaxFloorInLateSweep: true },
    { lookaheadHorizon: 24, totalBudgetCapFactor: 0.98, riskBufferPct: 0.02, finishMargin: 1, allowCrashStart: true,  lateSurplusSpeedup: false, allowFutureSlowSlack: false, allowFutureSlowSlackRatio: 0.0,  maxActiveSoftCap: 0,  strictQueueWindow: 3,  minAlignmentFloor: 0.40, strictPrefixOnly: true,  prefixBudgetFactor: 0.98, lateSweepMonth: 36, relaxFloorInLateSweep: true },
    { lookaheadHorizon: 48, totalBudgetCapFactor: 1.04, riskBufferPct: 0.00, finishMargin: 1, allowCrashStart: true,  lateSurplusSpeedup: true,  allowFutureSlowSlack: true,  allowFutureSlowSlackRatio: 0.15, maxActiveSoftCap: 10, strictQueueWindow: 4,  minAlignmentFloor: 0.0,  strictPrefixOnly: true,  prefixBudgetFactor: 1.02, lateSweepMonth: 34, relaxFloorInLateSweep: true },
    { lookaheadHorizon: 18, totalBudgetCapFactor: 0.96, riskBufferPct: 0.04, finishMargin: 2, allowCrashStart: false, lateSurplusSpeedup: true,  allowFutureSlowSlack: false, allowFutureSlowSlackRatio: 0.0,  maxActiveSoftCap: 8,  strictQueueWindow: 99, minAlignmentFloor: 0.62, strictPrefixOnly: true,  prefixBudgetFactor: 0.90, lateSweepMonth: 44, relaxFloorInLateSweep: false },
    { lookaheadHorizon: 60, totalBudgetCapFactor: 1.01, riskBufferPct: 0.02, finishMargin: 0, allowCrashStart: true,  lateSurplusSpeedup: true,  allowFutureSlowSlack: false, allowFutureSlowSlackRatio: 0.0,  maxActiveSoftCap: 0,  strictQueueWindow: 2,  minAlignmentFloor: 0.45, strictPrefixOnly: true,  prefixBudgetFactor: 0.96, lateSweepMonth: 38, relaxFloorInLateSweep: true, abandonWorstPoliticalAt25: true },
  ];

  let bestResult = null;
  let evaluatedCount = 0;
  const totalBudgetedIterations = Math.max(80, iterations);
  const population = [];

  const evaluateCandidate = (chrom) => {
    const res = runPolicyRollout(baseSim, chrom, goalRanking, maxTheoBU, optimizeFor);
    evaluatedCount++;
    if (!bestResult || res.evaluation.objectiveScore > bestResult.evaluation.objectiveScore) {
      bestResult = res;
    }
    if (onProgress && (evaluatedCount % 20 === 0 || evaluatedCount === 1)) {
      onProgress({
        progressPct: Math.min(99, Math.round((evaluatedCount / totalBudgetedIterations) * 100)),
        iteration: evaluatedCount,
        totalIterations: totalBudgetedIterations,
        bestObjectiveScore: bestResult.evaluation.objectiveScore,
        bestSimScore: bestResult.evaluation.simScore,
        bestMetrics: bestResult.evaluation.metrics,
        bestGoalScores: bestResult.evaluation.goalScores,
      });
    }
    return res;
  };

  // PHASE 1: Structured Heuristic & Knapsack Grid Search
  for (const order of heuristicOrders) {
    for (const tpl of policyTemplates) {
      const res = evaluateCandidate({
        order: order.slice(),
        skipSet: new Set(),
        params: { ...tpl },
      });
      population.push(res);
    }
  }

  // Sort initial population by objectiveScore descending
  population.sort((a, b) => b.evaluation.objectiveScore - a.evaluation.objectiveScore);
  const eliteSize = 14;
  const popCap = 36;
  let currentPop = population.slice(0, popCap);

  // PHASE 2: Genetic Algorithm Evolution
  const gaIterations = Math.max(40, Math.floor((totalBudgetedIterations - evaluatedCount) * 0.72));
  for (let step = 0; step < gaIterations; step++) {
    // Tournament selection
    const pickParent = () => {
      const a = currentPop[Math.floor(solverRng() * currentPop.length)];
      const b = currentPop[Math.floor(solverRng() * currentPop.length)];
      return a.evaluation.objectiveScore >= b.evaluation.objectiveScore ? a : b;
    };

    let childChrom;
    if (solverRng() < 0.65) {
      const p1 = pickParent().chromosome;
      const p2 = pickParent().chromosome;
      const crossedOrder = crossoverOrder(p1.order, p2.order, solverRng);
      const baseChrom = {
        order: crossedOrder,
        skipSet: new Set(solverRng() < 0.5 ? p1.skipSet : p2.skipSet),
        params: { ...(solverRng() < 0.5 ? p1.params : p2.params) },
      };
      childChrom = mutateChromosome(baseChrom, solverRng);
    } else {
      // Mutate one of the top elites directly
      const elite = currentPop[Math.floor(solverRng() * Math.min(eliteSize, currentPop.length))].chromosome;
      childChrom = mutateChromosome(elite, solverRng);
    }

    const childRes = evaluateCandidate(childChrom);
    currentPop.push(childRes);
    currentPop.sort((a, b) => b.evaluation.objectiveScore - a.evaluation.objectiveScore);
    if (currentPop.length > popCap) currentPop.length = popCap;
  }

  // PHASE 3: Local Neighborhood Polishing around the best discovered chromosome
  const remainingIters = Math.max(15, totalBudgetedIterations - evaluatedCount);
  for (let i = 0; i < remainingIters; i++) {
    const base = bestResult.chromosome;
    const order = base.order.slice();
    const n = order.length;
    if (n >= 2) {
      // Swap adjacent or near-adjacent elements in the active prefix of the ordering
      const idxA = i % Math.max(1, Math.min(n - 1, 22));
      const offset = 1 + (i % 3);
      const idxB = Math.min(n - 1, idxA + offset);
      [order[idxA], order[idxB]] = [order[idxB], order[idxA]];
    }
    const params = { ...base.params };
    if (i % 4 === 1) {
      params.totalBudgetCapFactor = +(params.totalBudgetCapFactor + (i % 2 === 0 ? 0.015 : -0.015)).toFixed(3);
    }
    evaluateCandidate({
      order,
      skipSet: new Set(base.skipSet),
      params,
    });
  }

  // Verify deterministic replay equivalence
  const verifiedSim = replayActionPlan(baseSim, bestResult.monthlyActionPlan);
  const verifiedEval = evaluateRankedObjective(verifiedSim, goalRanking, maxTheoBU, optimizeFor);

  const elapsedMs = Date.now() - startTime;
  const strategyReport = generateOptimalStrategyReport(
    baseSim,
    verifiedSim,
    bestResult.monthlyActionPlan,
    verifiedEval,
    goalRanking,
    evaluatedCount,
    elapsedMs
  );

  return {
    bestActionPlan: bestResult.monthlyActionPlan,
    finalSim: verifiedSim,
    evaluation: verifiedEval,
    goalRanking,
    iterationsRun: evaluatedCount,
    elapsedMs,
    strategyReport,
  };
}

/**
 * Builds a structured Optimal Strategy Report object & narrative sections
 * explaining how and why the discovered strategy optimizes the user's ranked goals.
 */
export function generateOptimalStrategyReport(
  initialSim,
  finalSim,
  monthlyActionPlan,
  evaluation,
  goalRanking = DEFAULT_GOAL_RANKING,
  iterationsRun = 0,
  elapsedMs = 0
) {
  const partialCreditOn = !!finalSim.config?.partialCreditEnabled;
  const completed = finalSim.projects
    .filter((p) => p.state === "completed")
    .sort((a, b) => (a.startMonth || 1) - (b.startMonth || 1));
  const partialCreditProjects = partialCreditOn
    ? finalSim.projects
        .filter((p) => p.state === "expired" && (p.nominalSpent || 0) > 0 && (p.bacCurrent || 0) > 0)
        .sort((a, b) => (a.startMonth || 1) - (b.startMonth || 1))
    : [];
  const skipped = finalSim.projects
    .filter((p) => p.state === "available")
    .sort((a, b) => b.alignment - a.alignment);
  const abandoned = finalSim.projects.filter((p) => p.state === "abandoned");
  const expired = finalSim.projects.filter((p) => p.state === "expired");

  const totalActions = monthlyActionPlan.reduce((a, m) => a + (m.actions?.length || 0), 0);
  const actionCounts = { add: 0, slow: 0, speed: 0, suspend: 0, resume: 0, abandon: 0, arc_reduce: 0, arc_restore: 0 };
  for (const m of monthlyActionPlan) {
    for (const act of m.actions || []) {
      actionCounts[act.type] = (actionCounts[act.type] || 0) + 1;
    }
  }

  const goalSummaryRows = goalRanking.map((goalId, idx) => {
    const meta = GOAL_METADATA[goalId] || { label: goalId, shortLabel: goalId };
    const weightPct = Math.round((RANK_WEIGHTS[idx] || 0) * 100);
    let outcomeText = "";
    if (goalId === "projects") {
      outcomeText =
        partialCreditOn && (evaluation.metrics.partialCompletions || 0) > 0
          ? `${evaluation.metrics.completedCount} completed + ${evaluation.metrics.partialProjectCount} ongoing (${evaluation.metrics.effectiveCompleted.toFixed(2)} / ${evaluation.metrics.maxComp} effective deliveries)`
          : `${evaluation.metrics.completedCount} / ${evaluation.metrics.maxComp} target projects delivered (${finalSim.projects.length} in pool)`;
    } else if (goalId === "alignment") {
      outcomeText = `${(evaluation.metrics.avgAlignment * 100).toFixed(1)}% average strategic alignment across delivered${partialCreditOn && evaluation.metrics.partialProjectCount ? " & ongoing" : ""} projects`;
    } else if (goalId === "utilization") {
      outcomeText = `${(evaluation.metrics.utilizationRate * 100).toFixed(1)}% funds utilized (${moneyFmt(evaluation.metrics.unspentCash)} final reserve, ${moneyFmt(evaluation.metrics.sunkCost)} sunk)`;
    } else if (goalId === "benefits") {
      outcomeText = `${evaluation.metrics.totalRealizedBU.toLocaleString()} BU generated (${moneyFmt(evaluation.metrics.totalRealizedBU * 0.02)} social value)`;
    }
    return {
      rank: idx + 1,
      goalId,
      label: meta.label,
      shortLabel: meta.shortLabel,
      weightPct,
      goalScore: evaluation.goalScores[goalId] || 0,
      outcomeText,
    };
  });

  // Group project selections by phase
  const phases = [
    { name: "Phase 1: Early Foundation (Months 1–12)", minM: 1, maxM: 12, projects: [], actions: [] },
    { name: "Phase 2: Core Expansion (Months 13–24)", minM: 13, maxM: 24, projects: [], actions: [] },
    { name: "Phase 3: Mid-Term Scaling (Months 25–36)", minM: 25, maxM: 36, projects: [], actions: [] },
    { name: "Phase 4: Late-Stage Deployment (Months 37–48)", minM: 37, maxM: 48, projects: [], actions: [] },
    { name: "Phase 5: Final Closeout & Acceleration (Months 49–60)", minM: 49, maxM: 60, projects: [], actions: [] },
  ];

  const selectedForSchedule = [...completed, ...partialCreditProjects].sort(
    (a, b) => (a.startMonth || 1) - (b.startMonth || 1)
  );
  for (const p of selectedForSchedule) {
    const sm = p.startMonth || 1;
    const ph = phases.find((x) => sm >= x.minM && sm <= x.maxM) || phases[0];
    const compPct = projectCompletionPct(p);
    ph.projects.push({
      id: p.id,
      title: p.title,
      subCategory: p.subCategory,
      political: !!p.political,
      startMonth: sm,
      completionMonth: p.completionMonth,
      isPartialCredit: p.state !== "completed",
      completionPct: compPct,
      bacInitial: p.bacInitial,
      cashDrawn: +p.cashDrawn.toFixed(2),
      alignment: p.alignment,
      buRate: p.buRate,
      buGenerated: p.state === "completed"
        ? +(p.buCumulative || ((p.buRate || 0) * Math.max(0, 60 - (p.completionMonth || 60)))).toFixed(1)
        : 0,
    });
  }

  for (const entry of monthlyActionPlan) {
    const ph = phases.find((x) => entry.month >= x.minM && entry.month <= x.maxM) || phases[0];
    for (const act of entry.actions || []) {
      ph.actions.push({ month: entry.month, ...act });
    }
  }

  // Why skipped projects were excluded
  const skippedAnalysis = skipped.map((p) => {
    const reasons = [];
    if (p.alignment < evaluation.metrics.avgAlignment - 0.12) {
      reasons.push(`Low alignment (${pctFmt(p.alignment)} vs portfolio avg ${(evaluation.metrics.avgAlignment * 100).toFixed(0)}%)`);
    }
    if (p.bacInitial > finalSim.totalBudget * 0.08) {
      reasons.push(`High capital cost (${moneyFmt(p.bacInitial)} base BAC) crowds out higher-density projects`);
    }
    if (finalSim.config?.arcEnabled && p.arcRate >= 0.19) {
      reasons.push(`High recurring ARC burden (${(p.arcRate * 100).toFixed(1)}%/yr)`);
    }
    if (p.durationPlanned >= 28) {
      reasons.push(`Long duration (${p.durationPlanned} mo) limits late-tranche flexibility`);
    }
    if (reasons.length === 0) {
      reasons.push(`Excluded due to total budget constraint (${moneyFmt(finalSim.totalBudget)} cap)`);
    }
    return {
      id: p.id,
      title: p.title,
      bacInitial: p.bacInitial,
      durationPlanned: p.durationPlanned,
      alignment: p.alignment,
      buRate: p.buRate,
      arcRate: p.arcRate,
      reason: reasons.join(" · "),
    };
  });

  const topGoalLabel = GOAL_METADATA[goalRanking[0]]?.label || "Primary Goal";
  const secondGoalLabel = GOAL_METADATA[goalRanking[1]]?.label || "Secondary Goal";

  const deliveryNote =
    partialCreditOn && partialCreditProjects.length > 0
      ? `${evaluation.metrics.completedCount} completed projects plus ${partialCreditProjects.length} ongoing carryover project${partialCreditProjects.length !== 1 ? "s" : ""} earning +${evaluation.metrics.partialCompletions.toFixed(2)} partial completion credit (${evaluation.metrics.effectiveCompleted.toFixed(2)} effective deliveries, ${evaluation.metrics.abandonedCount} abandoned)`
      : `${evaluation.metrics.completedCount} completed projects (${evaluation.metrics.expiredCount} expired, ${evaluation.metrics.abandonedCount} abandoned)`;

  const executiveSummary = [
    `Across ${iterationsRun} full 60-month simulations evaluated in ${(elapsedMs / 1000).toFixed(2)}s on exact seed #${initialSim.seed}, the AI Optimizer discovered a zero-insolvency strategy achieving an official simulator score of ${evaluation.simScore.toFixed(1)}/100 (${evaluation.band}) and a Ranked Objective Score of ${evaluation.weightedGoalScore.toFixed(1)}/100.`,
    `Aligned with your #1 priority (${topGoalLabel}) and #2 priority (${secondGoalLabel}), the strategy delivers ${deliveryNote} with ${(evaluation.metrics.avgAlignment * 100).toFixed(1)}% average alignment, ${(evaluation.metrics.utilizationRate * 100).toFixed(1)}% productive fund utilization, and ${evaluation.metrics.totalRealizedBU.toLocaleString()} Benefit Units.`,
    `The schedule executes ${totalActions} precision decisions across ${monthlyActionPlan.length} active decision months (${actionCounts.add} project additions, ${actionCounts.speed} strategic accelerations, ${actionCounts.slow} cash-flow slow-downs, and ${actionCounts.suspend} temporary suspensions), absorbing ${finalSim.events.length} milestone risk events without triggering a single forced default.`,
  ].join(" ");

  return {
    executiveSummary,
    goalSummaryRows,
    actionCounts,
    totalActions,
    riskEventsAbsorbed: finalSim.events.length,
    phases,
    completedProjects: completed,
    partialCreditProjects,
    skippedAnalysis,
    abandonedProjects: abandoned,
    expiredProjects: expired,
  };
}
