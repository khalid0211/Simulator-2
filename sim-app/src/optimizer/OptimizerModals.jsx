import React, { useState, useMemo } from "react";
import {
  Play, Pause, FastForward, FileText, Award, Target, Zap, Flag,
  ArrowUp, ArrowDown, CheckCircle2, Sparkles, X, Download, ChevronRight,
  SkipForward, Hand, Layers, ListChecks, Ban, TrendingUp, FlaskConical,
  Plus, Trash2, BarChart3, Table, BookOpen,
} from "lucide-react";
import {
  GOAL_METADATA,
  RANK_WEIGHTS,
  DEFAULT_GOAL_RANKING,
} from "./simulationEngine.js";
import {
  formatGoalRankingShort,
  generateResearchComparisonReport,
  exportResearchRunToExcel,
  exportResearchRunToMarkdown,
} from "./researchRunEngine.js";

const mono = {
  fontVariantNumeric: "tabular-nums",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const money = (n) =>
  n == null
    ? "—"
    : "$" +
      Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) +
      "M";

const pct = (n) => ((n || 0) * 100).toFixed(0) + "%";

const GOAL_ICONS = {
  projects: Award,
  alignment: Target,
  utilization: Zap,
  benefits: Flag,
};

const RANK_PRESETS = [
  {
    label: "Projects First",
    ranking: ["projects", "alignment", "utilization", "benefits"],
  },
  {
    label: "Alignment First",
    ranking: ["alignment", "utilization", "projects", "benefits"],
  },
  {
    label: "Utilization First",
    ranking: ["utilization", "projects", "alignment", "benefits"],
  },
  {
    label: "Benefits First",
    ranking: ["benefits", "alignment", "utilization", "projects"],
  },
];

/* ============================================================
   1. SETUP SCREEN: GOAL RANKING SELECTOR + RESEARCH RUN STUDIO
   ============================================================ */
export function GoalRankingSelector({
  goalRanking = DEFAULT_GOAL_RANKING,
  onChange,
  researchRuns = [],
  activeResearchRun = null,
  onSelectResearchRun,
  onCreateResearchRun,
  onDeleteResearchRun,
  onOpenResearchReport,
  onRunBatchComparison,
  isBatchRunning = false,
  T,
}) {
  const [newTitle, setNewTitle] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const moveGoal = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= goalRanking.length) return;
    const next = goalRanking.slice();
    [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
    onChange(next);
  };

  const handleCreate = () => {
    if (!onCreateResearchRun) return;
    const defaultTitle =
      newTitle.trim() ||
      `Research Study ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    onCreateResearchRun(defaultTitle);
    setNewTitle("");
    setShowNewForm(false);
  };

  return (
    <div
      style={{
        background: T.panel2,
        border: `1.5px solid ${T.action}55`,
        borderRadius: 10,
        padding: 14,
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              fontWeight: 700,
              color: T.action,
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            <Sparkles size={14} /> AI Auto-Optimizer — Goal Priority Ranking
          </div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
            Rank the 4 optimization objectives from #1 (Highest Priority) to #4. The AI solver will discover the optimal 60-month strategy for this exact scenario.
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {RANK_PRESETS.map((pr) => {
            const isActive = pr.ranking.every((g, i) => g === goalRanking[i]);
            return (
              <button
                key={pr.label}
                type="button"
                onClick={() => onChange(pr.ranking)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  border: `1px solid ${isActive ? T.action : T.line}`,
                  background: isActive ? T.action + "18" : T.panel,
                  color: isActive ? T.action : T.muted,
                }}
              >
                {pr.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {goalRanking.map((goalId, idx) => {
          const meta = GOAL_METADATA[goalId] || {
            label: goalId,
            description: "",
          };
          const Icon = GOAL_ICONS[goalId] || Award;
          const weightPct = Math.round((RANK_WEIGHTS[idx] || 0.1) * 100);
          const rankColors = [T.completed, T.action, T.suspended, T.muted];
          const badgeColor = rankColors[idx] || T.muted;

          return (
            <div
              key={goalId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 11px",
                borderRadius: 8,
                background: T.panel,
                border: `1px solid ${idx === 0 ? T.action + "66" : T.line}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 58,
                    padding: "3px 7px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    background: badgeColor + "18",
                    color: badgeColor,
                    border: `1px solid ${badgeColor}44`,
                    ...mono,
                  }}
                >
                  #{idx + 1} · {weightPct}%
                </span>
                <Icon size={15} color={badgeColor} style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                    {meta.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: T.muted,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {meta.description}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveGoal(idx, -1)}
                  title="Move up in priority"
                  style={{
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: `1px solid ${T.line}`,
                    background: idx === 0 ? "transparent" : T.panel2,
                    color: idx === 0 ? T.line : T.text,
                    cursor: idx === 0 ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  disabled={idx === goalRanking.length - 1}
                  onClick={() => moveGoal(idx, 1)}
                  title="Move down in priority"
                  style={{
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: `1px solid ${T.line}`,
                    background: idx === goalRanking.length - 1 ? "transparent" : T.panel2,
                    color: idx === goalRanking.length - 1 ? T.line : T.text,
                    cursor: idx === goalRanking.length - 1 ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <ArrowDown size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* RESEARCH RUN STUDIO SECTION */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${T.line}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 800,
                color: T.completed,
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              <FlaskConical size={14} /> Research Run Recorder & Scenario Comparator
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              Every Auto-Optimize run automatically records its results in the active Research Run so you can change goal rankings or budgets and compare outcomes side-by-side.
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setShowNewForm((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                borderRadius: 7,
                border: `1px solid ${T.completed}`,
                background: T.completed + "16",
                color: T.completed,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Plus size={13} /> New Research Run
            </button>
            {activeResearchRun && onOpenResearchReport && (
              <button
                type="button"
                onClick={() => onOpenResearchReport(activeResearchRun)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: `1px solid ${T.action}`,
                  background: T.action,
                  color: "#fff",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <BarChart3 size={13} /> Compare & Report ({activeResearchRun.entries?.length || 0} runs)
              </button>
            )}
          </div>
        </div>

        {showNewForm && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              background: T.panel,
              border: `1px solid ${T.completed}`,
              borderRadius: 8,
              padding: "9px 11px",
              marginBottom: 10,
            }}
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              placeholder="Research Run title (e.g. Goal Ranking Sensitivity Study)"
              style={{
                flex: 1,
                minWidth: 210,
                padding: "7px 10px",
                borderRadius: 6,
                border: `1px solid ${T.line}`,
                background: T.panel2,
                color: T.text,
                fontSize: 12.5,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleCreate}
              style={{
                padding: "7px 12px",
                borderRadius: 6,
                border: `1px solid ${T.completed}`,
                background: T.completed,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Start Research Run (Lock Portfolio & Seed)
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              style={{
                padding: "7px 10px",
                borderRadius: 6,
                border: `1px solid ${T.line}`,
                background: T.panel2,
                color: T.muted,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Active Research Run Selector & Summary */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <select
            value={activeResearchRun?.id || "auto-new"}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "auto-new") {
                onSelectResearchRun && onSelectResearchRun(null);
              } else {
                const found = researchRuns.find((r) => r.id === val);
                if (found && onSelectResearchRun) onSelectResearchRun(found);
              }
            }}
            style={{
              flex: 1,
              minWidth: 230,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${T.line}`,
              background: T.panel,
              color: T.text,
              fontSize: 12.5,
            }}
          >
            <option value="auto-new">
              ✨ Auto-Create New Research Run on Next Auto-Optimize
            </option>
            {researchRuns.map((rr) => (
              <option key={rr.id} value={rr.id}>
                🔬 {rr.title} ({rr.entries?.length || 0} runs · {rr.portfolioName} · by {rr.ownerName || "Player"} ·{" "}
                {new Date(rr.createdAt).toLocaleDateString()})
              </option>
            ))}
          </select>

          {onRunBatchComparison && (
            <button
              type="button"
              disabled={isBatchRunning}
              onClick={onRunBatchComparison}
              title="Automatically run all 4 Goal Priority Rankings (#1 Projects, #1 Alignment, #1 Utilization, #1 Benefits) on this exact portfolio & seed and record all 4 into the Research Run"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "8px 11px",
                borderRadius: 8,
                border: `1px solid ${T.action}`,
                background: T.panel,
                color: T.action,
                fontSize: 12,
                fontWeight: 700,
                cursor: isBatchRunning ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Sparkles size={13} />{" "}
              {isBatchRunning ? "Running 4-Ranking Batch…" : "Run All 4 Goal Rankings"}
            </button>
          )}

          {activeResearchRun && onDeleteResearchRun && (
            <button
              type="button"
              onClick={() => onDeleteResearchRun(activeResearchRun)}
              title="Delete this Research Run"
              style={{
                padding: "8px 9px",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                background: T.panel,
                color: T.expired,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {activeResearchRun && (
          <div
            style={{
              marginTop: 8,
              padding: "7px 10px",
              borderRadius: 7,
              background: T.panel,
              border: `1px solid ${T.lineSoft}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              fontSize: 11.5,
              color: T.muted,
            }}
          >
            <span>
              <strong style={{ color: T.text }}>{activeResearchRun.title}</strong> · Created by{" "}
              <strong>{activeResearchRun.ownerName || "Player"}</strong> on{" "}
              {new Date(activeResearchRun.createdAt).toLocaleString()}
            </span>
            <span style={{ ...mono, color: T.action, fontWeight: 700 }}>
              {activeResearchRun.entries?.length || 0} run{(activeResearchRun.entries?.length || 0) !== 1 ? "s" : ""} ·{" "}
              {activeResearchRun.portfolioName} ({activeResearchRun.projectCount} projects · {money(activeResearchRun.totalBac)} · Seed #{activeResearchRun.baseSeed})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   2. SOLVER PROGRESS & DISCOVERY MODAL
   ============================================================ */
export function OptimizerDiscoveryModal({
  initialSim,
  isOptimizing,
  progress,
  result,
  error,
  goalRanking = DEFAULT_GOAL_RANKING,
  activeResearchRun = null,
  onOpenResearchReport,
  onCancel,
  onWatchAutoPlay,
  onInstantApply,
  onOpenStrategyReport,
  T,
}) {
  const pctDone = progress?.progressPct ?? (result ? 100 : 0);
  const evalData = result?.evaluation;
  const metrics = evalData?.metrics || progress?.bestMetrics;
  const goalScores = evalData?.goalScores || progress?.bestGoalScores;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: T.scrim,
        display: "grid",
        placeItems: "center",
        zIndex: 70,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(740px, 96vw)",
          maxHeight: "92vh",
          background: T.panel,
          border: `1px solid ${T.line}`,
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          boxShadow: T.shadow,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 22px",
            borderBottom: `1px solid ${T.line}`,
            background: T.panel2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={20} color={T.action} />
            <div>
              <h2 style={{ margin: 0, fontSize: 17 }}>
                {isOptimizing
                  ? "Discovering Optimal 60-Month Strategy…"
                  : error
                  ? "Optimization Error"
                  : "Optimal Strategy Discovered"}
              </h2>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, ...mono }}>
                Scenario: {initialSim?.name || "Custom Portfolio"} · Exact Seed #{initialSim?.seed} ·{" "}
                {initialSim?.projects?.length || 30} projects · Budget {money(initialSim?.totalBudget)}
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: T.muted,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px", overflowY: "auto", flex: 1 }}>
          {/* Progress Bar */}
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12.5,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              <span style={{ color: isOptimizing ? T.action : T.completed }}>
                {isOptimizing
                  ? `Running Knapsack DP + Genetic Evolution + Local Search (${progress?.iteration || 0}/${progress?.totalIterations || 300} rollouts)…`
                  : `✓ Evaluated ${result?.iterationsRun || 300} full 60-month simulations in ${((result?.elapsedMs || 1000) / 1000).toFixed(2)}s`}
              </span>
              <span style={{ ...mono, color: T.text }}>{pctDone}%</span>
            </div>
            <div
              style={{
                height: 9,
                background: T.panel2,
                borderRadius: 999,
                overflow: "hidden",
                border: `1px solid ${T.line}`,
              }}
            >
              <div
                style={{
                  width: `${pctDone}%`,
                  height: "100%",
                  background: isOptimizing ? T.action : T.completed,
                  transition: "width .2s ease-out",
                }}
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: T.expired + "18",
                border: `1px solid ${T.expired}`,
                color: T.expired,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Ranked Goal Outcomes Grid */}
          {metrics && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    background: T.panel2,
                    border: `1px solid ${T.line}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: T.muted,
                        textTransform: "uppercase",
                        letterSpacing: ".05em",
                      }}
                    >
                      Official Simulator Score
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
                      Band: <strong style={{ color: T.completed }}>{evalData?.band || "Good"}</strong> · 0 Insolvencies
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: T.completed,
                      ...mono,
                    }}
                  >
                    {(evalData?.simScore ?? progress?.bestSimScore ?? 0).toFixed(1)}
                    <span style={{ fontSize: 13, color: T.faint }}>/100</span>
                  </div>
                </div>

                <div
                  style={{
                    background: T.panel2,
                    border: `1px solid ${T.line}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: T.muted,
                        textTransform: "uppercase",
                        letterSpacing: ".05em",
                      }}
                    >
                      Ranked Goal Objective
                    </div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
                      Weighted by your #1–#4 priority order
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: T.action,
                      ...mono,
                    }}
                  >
                    {(evalData?.weightedGoalScore ?? progress?.bestObjectiveScore ?? 0).toFixed(1)}
                    <span style={{ fontSize: 13, color: T.faint }}>/100</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.muted,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  marginBottom: 8,
                }}
              >
                Performance Across Your Ranked Goals
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {goalRanking.map((goalId, idx) => {
                  const meta = GOAL_METADATA[goalId];
                  const Icon = GOAL_ICONS[goalId] || Award;
                  const weightPct = Math.round((RANK_WEIGHTS[idx] || 0) * 100);
                  let bigVal = "—";
                  let subVal = "";
                  if (goalId === "projects") {
                    bigVal =
                      metrics.partialCreditOn && (metrics.partialCompletions || 0) > 0
                        ? `${metrics.effectiveCompleted.toFixed(1)} / ${metrics.maxComp}`
                        : `${metrics.completedCount} / ${metrics.maxComp}`;
                    subVal =
                      metrics.partialCreditOn && (metrics.partialProjectCount || 0) > 0
                        ? `${metrics.completedCount} completed + ${metrics.partialProjectCount} ongoing (+${metrics.partialCompletions.toFixed(2)} partial credit)`
                        : `${metrics.expiredCount} expired · ${metrics.abandonedCount} abandoned`;
                  } else if (goalId === "alignment") {
                    bigVal = `${(metrics.avgAlignment * 100).toFixed(1)}%`;
                    subVal = `Avg strategic fit across ${metrics.completedCount} completed projects`;
                  } else if (goalId === "utilization") {
                    bigVal = `${(metrics.utilizationRate * 100).toFixed(1)}%`;
                    subVal = `${money(metrics.unspentCash)} final unspent reserve`;
                  } else if (goalId === "benefits") {
                    bigVal = `${Math.round(metrics.totalRealizedBU).toLocaleString()} BU`;
                    subVal = `${money(metrics.totalRealizedBU * 0.02)} social value generated`;
                  }

                  return (
                    <div
                      key={goalId}
                      style={{
                        padding: "11px 13px",
                        borderRadius: 10,
                        background: T.panel,
                        border: `1.5px solid ${idx === 0 ? T.action : T.line}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: idx === 0 ? T.action : T.text,
                          }}
                        >
                          <Icon size={13} color={idx === 0 ? T.action : T.muted} />
                          #{idx + 1} {meta?.shortLabel || goalId}
                        </span>
                        <span
                          style={{
                            fontSize: 10.5,
                            color: T.faint,
                            ...mono,
                          }}
                        >
                          Weight {weightPct}%
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: T.text,
                          ...mono,
                        }}
                      >
                        {bigVal}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                        {subVal}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Strategy Brief once complete */}
          {result?.strategyReport && (
            <div
              style={{
                background: T.panel2,
                border: `1px solid ${T.line}`,
                borderLeft: `3px solid ${T.action}`,
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 12.5,
                lineHeight: 1.6,
                color: T.text,
                marginBottom: activeResearchRun ? 12 : 0,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: T.action,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  marginBottom: 4,
                }}
              >
                Optimal Strategy Blueprint
              </div>
              {result.strategyReport.executiveSummary}
            </div>
          )}

          {result && activeResearchRun && (
            <div
              style={{
                background: T.completed + "14",
                border: `1px solid ${T.completed}55`,
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12.5, color: T.text }}>
                <span style={{ color: T.completed, fontWeight: 800 }}>
                  ✓ Recorded in Research Run:
                </span>{" "}
                <strong>{activeResearchRun.title}</strong> ({activeResearchRun.entries?.length || 1} run
                {(activeResearchRun.entries?.length || 1) !== 1 ? "s" : ""} recorded)
              </div>
              {onOpenResearchReport && (
                <button
                  onClick={() => onOpenResearchReport(activeResearchRun)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 11px",
                    borderRadius: 7,
                    border: `1px solid ${T.completed}`,
                    background: T.completed,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <BarChart3 size={13} /> View Research Comparison Report
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: `1px solid ${T.line}`,
            background: T.panel2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: `1px solid ${T.line}`,
              background: T.panel,
              color: T.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isOptimizing ? "Cancel Solver" : "Back to Setup"}
          </button>

          {result && !isOptimizing && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={onOpenStrategyReport}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: `1px solid ${T.action}`,
                  background: T.panel,
                  color: T.action,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <FileText size={15} /> Optimal Strategy Report
              </button>

              <button
                onClick={onInstantApply}
                title="Jump directly to the end of Month 60 with all optimal decisions applied"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: `1px solid ${T.line}`,
                  background: T.panel,
                  color: T.text,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <SkipForward size={15} /> Instant Apply (End Result)
              </button>

              <button
                onClick={() => onWatchAutoPlay("step")}
                title="Step through the simulation at your own pace — inspect every AI decision at each step before moving to the next"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${T.completed}`,
                  background: T.completed + "16",
                  color: T.completed,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <ListChecks size={15} /> Watch AI (Step Mode)
              </button>

              <button
                onClick={() => onWatchAutoPlay("continuous")}
                title="Watch the AI play continuously through all 60 months automatically"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: `1px solid ${T.action}`,
                  background: T.action,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Play size={15} /> Watch AI (Continuous)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   3. OPTIMAL STRATEGY REPORT MODAL
   ============================================================ */
export function OptimalStrategyReportModal({
  initialSim,
  result,
  onClose,
  onWatchAutoPlay,
  onInstantApply,
  onExportExcel,
  T,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  if (!result || !result.strategyReport) return null;

  const { strategyReport, evaluation, bestActionPlan, finalSim } = result;
  const { metrics } = evaluation;

  const REPORT_TABS = [
    { id: "overview", label: "Executive Summary & Goals", icon: Award },
    {
      id: "schedule",
      label: `Selected Projects (${strategyReport.completedProjects.length + (strategyReport.partialCreditProjects?.length || 0)})`,
      icon: Layers,
    },
    { id: "playbook", label: `Monthly Playbook (${strategyReport.totalActions})`, icon: ListChecks },
    { id: "skipped", label: `Excluded Projects (${strategyReport.skippedAnalysis.length})`, icon: Ban },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: T.scrim,
        display: "grid",
        placeItems: "center",
        zIndex: 75,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 96vw)",
          maxHeight: "90vh",
          background: T.panel,
          border: `1px solid ${T.line}`,
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          boxShadow: T.shadow,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 22px",
            borderBottom: `1px solid ${T.line}`,
            background: T.panel2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileText size={20} color={T.action} />
            <div>
              <h2 style={{ margin: 0, fontSize: 17 }}>
                AI Optimal Portfolio Strategy Report
              </h2>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2, ...mono }}>
                {finalSim.name} · Seed #{finalSim.seed} · Final Score{" "}
                <strong style={{ color: T.completed }}>{evaluation.simScore.toFixed(1)}/100 ({evaluation.band})</strong> ·{" "}
                {metrics.completedCount}/{metrics.maxComp} Delivered · {(metrics.avgAlignment * 100).toFixed(1)}% Alignment ·{" "}
                {(metrics.utilizationRate * 100).toFixed(1)}% Utilized · {Math.round(metrics.totalRealizedBU).toLocaleString()} BU
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: T.muted,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${T.line}`,
            background: T.panel,
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {REPORT_TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "11px 16px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2.5px solid ${active ? T.action : "transparent"}`,
                  color: active ? T.action : T.muted,
                  whiteSpace: "nowrap",
                }}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
          {activeTab === "overview" && (
            <div>
              <div
                style={{
                  background: T.panel2,
                  border: `1px solid ${T.line}`,
                  borderLeft: `4px solid ${T.action}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  fontSize: 13.5,
                  lineHeight: 1.65,
                  color: T.text,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.action,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 6,
                  }}
                >
                  1. Executive Optimization Synthesis
                </div>
                {strategyReport.executiveSummary}
              </div>

              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".05em", color: T.muted, margin: "0 0 10px" }}>
                2. Ranked Goal Achievement Matrix
              </h3>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12.5,
                  marginBottom: 20,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.line}`, background: T.panel2 }}>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Priority Rank</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Optimization Goal</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Weight</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Goal Index</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Achieved Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyReport.goalSummaryRows.map((row) => (
                    <tr key={row.goalId} style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                      <td style={{ padding: "9px 10px", fontWeight: 700, color: row.rank === 1 ? T.action : T.text, ...mono }}>
                        Rank #{row.rank}
                      </td>
                      <td style={{ padding: "9px 10px", fontWeight: 600 }}>{row.label}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: T.muted, ...mono }}>{row.weightPct}%</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, color: T.completed, ...mono }}>
                        {row.goalScore.toFixed(1)}
                      </td>
                      <td style={{ padding: "9px 10px", color: T.muted }}>{row.outcomeText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".05em", color: T.muted, margin: "0 0 10px" }}>
                3. Strategic Levers & Risk Resilience
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  ["Projects Initiated", `${strategyReport.actionCounts.add} added`, "Timed to tranche releases to minimize inflation"],
                  ["Speed-Up Interventions", `${strategyReport.actionCounts.speed} accelerations`, "Used to prevent M60 expiry & deploy late surplus"],
                  ["Cash-Flow Slowdowns", `${strategyReport.actionCounts.slow} slow-downs`, "Used to smooth S-curve peaks without abandonment"],
                  ["Risk Shocks Absorbed", `${strategyReport.riskEventsAbsorbed} milestone shocks`, "25%/50%/75% cost & duration shocks absorbed cleanly"],
                ].map(([title, val, sub]) => (
                  <div
                    key={title}
                    style={{
                      background: T.panel2,
                      border: `1px solid ${T.line}`,
                      borderRadius: 10,
                      padding: "11px 12px",
                    }}
                  >
                    <div style={{ fontSize: 10.5, color: T.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>{title}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginTop: 4, ...mono }}>{val}</div>
                    <div style={{ fontSize: 11, color: T.faint, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "schedule" && (
            <div>
              {strategyReport.phases.map((ph) => (
                <div key={ph.name} style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "7px 12px",
                      background: T.panel2,
                      borderRadius: 8,
                      border: `1px solid ${T.line}`,
                      marginBottom: 8,
                    }}
                  >
                    <strong style={{ fontSize: 12.5, color: T.action }}>{ph.name}</strong>
                    <span style={{ fontSize: 11.5, color: T.muted, ...mono }}>
                      {ph.projects.length} project{ph.projects.length !== 1 ? "s" : ""} initiated
                    </span>
                  </div>
                  {ph.projects.length === 0 ? (
                    <div style={{ fontSize: 12, color: T.faint, padding: "4px 12px" }}>
                      No new project additions in this window — focus on executing active S-curves & ARC coverage.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${T.line}`, color: T.muted }}>
                          <th style={{ padding: "5px 8px", textAlign: "left" }}>ID</th>
                          <th style={{ padding: "5px 8px", textAlign: "left" }}>Project Title</th>
                          <th style={{ padding: "5px 8px", textAlign: "left" }}>Subcategory</th>
                          <th style={{ padding: "5px 8px", textAlign: "center" }}>Window</th>
                          <th style={{ padding: "5px 8px", textAlign: "right" }}>Cash Drawn</th>
                          <th style={{ padding: "5px 8px", textAlign: "right" }}>Alignment</th>
                          <th style={{ padding: "5px 8px", textAlign: "right" }}>Total BU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ph.projects.map((p) => (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                            <td style={{ padding: "6px 8px", fontWeight: 700, color: T.action, ...mono }}>{p.id}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                              {p.title}{" "}
                              {p.political && (
                                <span style={{ fontSize: 10, color: T.expired, fontWeight: 700 }}>(Political)</span>
                              )}
                            </td>
                            <td style={{ padding: "6px 8px", color: T.muted }}>{p.subCategory}</td>
                            <td style={{ padding: "6px 8px", textAlign: "center", ...mono }}>
                              {p.isPartialCredit ? (
                                <span style={{ color: T.suspended, fontWeight: 700 }}>
                                  M{p.startMonth} → M60 ({Math.round((p.completionPct || 0) * 100)}% credit)
                                </span>
                              ) : (
                                `M${p.startMonth} → M${p.completionMonth}`
                              )}
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{money(p.cashDrawn)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: T.completed, ...mono }}>
                              {pct(p.alignment)}
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{p.buGenerated} BU</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "playbook" && (
            <div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted }}>
                Complete month-by-month action script discovered by the AI optimizer. During <strong>Visual Auto-Play</strong>, the simulator executes these exact decisions automatically.
              </p>
              {bestActionPlan.length === 0 ? (
                <div style={{ color: T.faint, fontSize: 13 }}>No decisions recorded.</div>
              ) : (
                bestActionPlan.map((entry) => (
                  <div
                    key={entry.month}
                    style={{
                      marginBottom: 10,
                      padding: "10px 12px",
                      borderRadius: 9,
                      background: T.panel2,
                      border: `1px solid ${T.line}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 800,
                        color: T.action,
                        textTransform: "uppercase",
                        letterSpacing: ".05em",
                        marginBottom: 6,
                        ...mono,
                      }}
                    >
                      Month {entry.month} ({entry.actions.length} action{entry.actions.length !== 1 ? "s" : ""})
                    </div>
                    {entry.actions.map((act, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          fontSize: 12.5,
                          padding: "4px 0",
                          borderTop: idx > 0 ? `1px solid ${T.lineSoft}` : "none",
                        }}
                      >
                        <span
                          style={{
                            minWidth: 74,
                            padding: "2px 6px",
                            borderRadius: 5,
                            fontSize: 10.5,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            textAlign: "center",
                            background:
                              act.type === "add"
                                ? T.completed + "20"
                                : act.type === "speed"
                                ? T.action + "20"
                                : T.suspended + "20",
                            color:
                              act.type === "add"
                                ? T.completed
                                : act.type === "speed"
                                ? T.action
                                : T.suspended,
                            ...mono,
                          }}
                        >
                          {act.type}
                          {act.a ? ` +${Math.round(act.a * 100)}%` : ""}
                          {act.s ? ` -${Math.round(act.s * 100)}%` : ""}
                        </span>
                        <span style={{ color: T.text, lineHeight: 1.45 }}>
                          {act.rationale || `${act.type.toUpperCase()} ${act.id} "${act.title}"`}
                        </span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "skipped" && (
            <div>
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted }}>
                These {strategyReport.skippedAnalysis.length} candidate projects were intentionally left out of the portfolio so capital could be concentrated on higher-priority projects.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.line}`, background: T.panel2, color: T.muted }}>
                    <th style={{ padding: "7px 8px", textAlign: "left" }}>ID</th>
                    <th style={{ padding: "7px 8px", textAlign: "left" }}>Title</th>
                    <th style={{ padding: "7px 8px", textAlign: "right" }}>Base BAC</th>
                    <th style={{ padding: "7px 8px", textAlign: "right" }}>Dur</th>
                    <th style={{ padding: "7px 8px", textAlign: "right" }}>Align</th>
                    <th style={{ padding: "7px 8px", textAlign: "right" }}>BU/mo</th>
                    <th style={{ padding: "7px 8px", textAlign: "left" }}>Exclusion Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {strategyReport.skippedAnalysis.map((p) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                      <td style={{ padding: "6px 8px", color: T.faint, ...mono }}>{p.id}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{p.title}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{money(p.bacInitial)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{p.durationPlanned}m</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{pct(p.alignment)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{p.buRate}</td>
                      <td style={{ padding: "6px 8px", color: T.muted, fontSize: 11.5 }}>{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 22px",
            borderTop: `1px solid ${T.line}`,
            background: T.panel2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            {onExportExcel && (
              <button
                onClick={() => onExportExcel(finalSim)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 13px",
                  borderRadius: 8,
                  border: `1px solid ${T.line}`,
                  background: T.panel,
                  color: T.text,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Download size={14} color={T.completed} /> Export Strategy & Outcomes (.xlsx)
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onInstantApply && (
              <button
                onClick={onInstantApply}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 13px",
                  borderRadius: 8,
                  border: `1px solid ${T.line}`,
                  background: T.panel,
                  color: T.text,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <SkipForward size={14} /> Jump to Final Debrief
              </button>
            )}
            {onWatchAutoPlay && (
              <>
                <button
                  onClick={() => onWatchAutoPlay("step")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 13px",
                    borderRadius: 8,
                    border: `1.5px solid ${T.completed}`,
                    background: T.completed + "16",
                    color: T.completed,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <ListChecks size={14} /> Watch AI (Step Mode)
                </button>
                <button
                  onClick={() => onWatchAutoPlay("continuous")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 15px",
                    borderRadius: 8,
                    border: `1px solid ${T.action}`,
                    background: T.action,
                    color: "#fff",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Play size={14} /> Watch AI (Continuous)
                </button>
              </>
            )}
            <button
              onClick={onClose}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                background: T.panel,
                color: T.text,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   4. LIVE VISUAL AUTO-PLAY CONTROL BAR (STEP & CONTINUOUS MODES)
   ============================================================ */
export function AutoPlayControlBar({
  sim,
  autoPlay,
  onSetMode,
  onTogglePlay,
  onStepOnce,
  onStepToNextDecision,
  onSetSpeed,
  onInstantFinish,
  onOpenReport,
  onStopAutoPlay,
  onFocusProject,
  T,
}) {
  if (!autoPlay?.active) return null;

  const { mode = "continuous", isPlaying, speedMs, lastRationale, currentMonthActions = [], result } = autoPlay;
  const isStepMode = mode === "step";
  const targetScore = result?.evaluation?.simScore;

  // Find next future month that has AI decisions
  const plan = result?.bestActionPlan || [];
  const nextDecisionEntry = plan.find((e) => e.month > sim.month && (e.actions?.length || 0) > 0);
  const nextDecisionMonth = nextDecisionEntry?.month || null;

  const SPEEDS = [
    { label: "1×", ms: 850 },
    { label: "3×", ms: 320 },
    { label: "10×", ms: 95 },
  ];

  return (
    <div
      style={{
        flexShrink: 0,
        background: isStepMode ? T.completed + "12" : T.action + "14",
        borderBottom: `1.5px solid ${isStepMode ? T.completed : T.action}55`,
        padding: "8px 18px",
        display: "flex",
        flexDirection: "column",
        gap: isStepMode ? 8 : 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Left: Mode Toggle & Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, flexWrap: "wrap" }}>
          {/* Step vs Continuous Segmented Mode Toggle */}
          <div
            style={{
              display: "inline-flex",
              background: T.panel,
              border: `1.5px solid ${T.line}`,
              borderRadius: 8,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => onSetMode && onSetMode("step")}
              title="Step Mode: Inspect every AI decision at each step and click Next Step when ready"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                fontSize: 11.5,
                fontWeight: 800,
                border: "none",
                cursor: "pointer",
                background: isStepMode ? T.completed : "transparent",
                color: isStepMode ? "#fff" : T.muted,
              }}
            >
              <ListChecks size={13} /> Step Mode
            </button>
            <button
              type="button"
              onClick={() => onSetMode && onSetMode("continuous")}
              title="Continuous Mode: AI automatically plays and advances through months on its own"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                fontSize: 11.5,
                fontWeight: 800,
                border: "none",
                cursor: "pointer",
                background: !isStepMode ? T.action : "transparent",
                color: !isStepMode ? "#fff" : T.muted,
              }}
            >
              <Play size={13} /> Continuous Mode
            </button>
          </div>

          {targetScore != null && (
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: isStepMode ? T.completed : T.action,
                flexShrink: 0,
                ...mono,
              }}
            >
              Optimal Target: {targetScore.toFixed(1)} pts
            </span>
          )}

          {!isStepMode && (
            <div
              style={{
                fontSize: 12,
                color: T.text,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
              }}
              title={lastRationale || "Executing optimal 60-month schedule…"}
            >
              {lastRationale ? (
                <>
                  <strong style={{ color: T.action }}>AI Decision:</strong> {lastRationale}
                </>
              ) : (
                <span style={{ color: T.muted }}>
                  Month {sim.month}/60 — Holding cash position & advancing active project S-curves…
                </span>
              )}
            </div>
          )}

          {isStepMode && (
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, ...mono }}>
              Step {sim.month} of 60 ·{" "}
              <span style={{ color: currentMonthActions.length > 0 ? T.completed : T.muted }}>
                {currentMonthActions.length > 0
                  ? `${currentMonthActions.length} AI Decision${currentMonthActions.length !== 1 ? "s" : ""} Applied in Month ${sim.month}`
                  : `0 New Interventions in Month ${sim.month} (S-Curves Progressing)`}
              </span>
            </div>
          )}
        </div>

        {/* Right: Mode-Specific Playback Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
          {isStepMode ? (
            <>
              <button
                onClick={onStepOnce}
                title={`Advance from Month ${sim.month} to Month ${sim.month + 1} and view Month ${sim.month + 1}'s AI decisions`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 13px",
                  borderRadius: 7,
                  border: `1.5px solid ${T.completed}`,
                  background: T.completed,
                  color: "#fff",
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {sim.month < 60 ? `Next Step (M${sim.month} → M${sim.month + 1})` : "Finalize Run (M60)"}{" "}
                <ChevronRight size={14} />
              </button>

              {nextDecisionMonth && nextDecisionMonth > sim.month + 1 && onStepToNextDecision && (
                <button
                  onClick={() => onStepToNextDecision(nextDecisionMonth)}
                  title={`Fast-forward through quiet months directly to Month ${nextDecisionMonth} where the AI makes its next decision`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 11px",
                    borderRadius: 7,
                    border: `1px solid ${T.action}`,
                    background: T.panel,
                    color: T.action,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <FastForward size={13} /> Next Decision (M{nextDecisionMonth})
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onTogglePlay}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 11px",
                  borderRadius: 7,
                  border: `1px solid ${T.action}`,
                  background: isPlaying ? T.panel : T.action,
                  color: isPlaying ? T.action : "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                {isPlaying ? "Pause" : "Resume"}
              </button>

              {/* Speed Selector */}
              <div
                style={{
                  display: "inline-flex",
                  background: T.panel,
                  border: `1px solid ${T.line}`,
                  borderRadius: 7,
                  overflow: "hidden",
                }}
              >
                {SPEEDS.map((sp) => {
                  const active = speedMs === sp.ms;
                  return (
                    <button
                      key={sp.label}
                      onClick={() => onSetSpeed(sp.ms)}
                      style={{
                        padding: "5px 8px",
                        fontSize: 11.5,
                        fontWeight: 700,
                        border: "none",
                        cursor: "pointer",
                        background: active ? T.action : "transparent",
                        color: active ? "#fff" : T.muted,
                        ...mono,
                      }}
                    >
                      {sp.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <button
            onClick={onInstantFinish}
            title="Fast-forward immediately to Month 60 result"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 7,
              border: `1px solid ${T.line}`,
              background: T.panel,
              color: T.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <SkipForward size={13} /> End (M60)
          </button>

          <button
            onClick={onOpenReport}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 7,
              border: `1px solid ${T.action}66`,
              background: T.panel,
              color: T.action,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <FileText size={13} /> Strategy Report
          </button>

          <button
            onClick={onStopAutoPlay}
            title="Stop AI Auto-Pilot and take manual control from this month"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 9px",
              borderRadius: 7,
              border: `1px solid ${T.line}`,
              background: T.panel,
              color: T.muted,
              fontSize: 11.5,
              cursor: "pointer",
            }}
          >
            <Hand size={12} /> Manual
          </button>
        </div>
      </div>

      {/* Step Mode Decision Inspector Cards for Current Month */}
      {isStepMode && (
        <div
          style={{
            background: T.panel,
            border: `1px solid ${T.line}`,
            borderRadius: 9,
            padding: "8px 12px",
            maxHeight: 135,
            overflowY: "auto",
          }}
        >
          {currentMonthActions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {currentMonthActions.map((act, idx) => {
                const badgeColor =
                  act.type === "add"
                    ? T.completed
                    : act.type === "speed"
                    ? T.action
                    : act.type === "slow" || act.type === "suspend"
                    ? T.suspended
                    : T.expired;
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => onFocusProject && act.id && onFocusProject(act.id)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: 12,
                      paddingTop: idx > 0 ? 5 : 0,
                      borderTop: idx > 0 ? `1px solid ${T.lineSoft}` : "none",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        minWidth: 72,
                        padding: "2px 6px",
                        borderRadius: 5,
                        fontSize: 10.5,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        textAlign: "center",
                        background: badgeColor + "20",
                        color: badgeColor,
                        flexShrink: 0,
                        ...mono,
                      }}
                    >
                      {act.type}
                      {act.a ? ` +${Math.round(act.a * 100)}%` : ""}
                      {act.s ? ` -${Math.round(act.s * 100)}%` : ""}
                    </span>
                    <span style={{ color: T.text, lineHeight: 1.45 }}>
                      {act.rationale || `${act.type.toUpperCase()} ${act.id} "${act.title}"`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.muted, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>
                No new project additions or tempo adjustments in <strong>Month {sim.month}</strong> — active projects are drawing on their S-curves within budget.
              </span>
              {nextDecisionMonth && (
                <span style={{ color: T.action, fontWeight: 600, ...mono }}>
                  Next AI decision scheduled at Month {nextDecisionMonth}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   5. RESEARCH RUN COMPARATIVE REPORT & EXPORT MODAL
   ============================================================ */
export function ResearchRunReportModal({
  researchRun,
  onClose,
  onReplayRunEntry,
  onDeleteRunEntry,
  onRunBatchComparison,
  isBatchRunning = false,
  T,
}) {
  const [activeTab, setActiveTab] = useState("table");
  const report = useMemo(
    () => (researchRun ? generateResearchComparisonReport(researchRun) : null),
    [researchRun]
  );

  if (!researchRun || !report) return null;
  const entries = researchRun.entries || [];

  const TABS = [
    { id: "table", label: `Comparative Runs Table (${entries.length})`, icon: Table },
    { id: "observations", label: "Observations & Analysis Report", icon: BookOpen },
    { id: "matrix", label: `Project Selection Matrix (${researchRun.projectCount})`, icon: Layers },
    { id: "portfolio", label: "Portfolio Baseline Data", icon: FileText },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: T.scrim,
        display: "grid",
        placeItems: "center",
        zIndex: 80,
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1080px, 97vw)",
          maxHeight: "92vh",
          background: T.panel,
          border: `1px solid ${T.line}`,
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          boxShadow: T.shadow,
          overflow: "hidden",
        }}
      >
        {/* Header Metadata Bar */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: `1px solid ${T.line}`,
            background: T.panel2,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FlaskConical size={20} color={T.completed} />
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Research Run: {researchRun.title}
              </h2>
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: T.completed + "20",
                  color: T.completed,
                  fontSize: 11,
                  fontWeight: 800,
                  ...mono,
                }}
              >
                {entries.length} Auto Run{entries.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px 16px",
                fontSize: 12,
                color: T.muted,
                marginTop: 6,
              }}
            >
              <span>
                <strong>Created by:</strong> {researchRun.ownerName || "Player"} ({researchRun.ownerEmail || "local"})
              </span>
              <span>
                <strong>Created:</strong> {new Date(researchRun.createdAt).toLocaleString()}
              </span>
              <span>
                <strong>Portfolio Used:</strong> {researchRun.portfolioName} ({researchRun.projectCount} projects · Total BAC{" "}
                {money(researchRun.totalBac)})
              </span>
              <span style={mono}>
                <strong>Base Seed:</strong> #{researchRun.baseSeed}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: T.muted,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${T.line}`,
            background: T.panel,
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "11px 16px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2.5px solid ${active ? T.action : "transparent"}`,
                  color: active ? T.action : T.muted,
                  whiteSpace: "nowrap",
                }}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
          {entries.length === 0 ? (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                background: T.panel2,
                borderRadius: 12,
                border: `1px dashed ${T.line}`,
              }}
            >
              <FlaskConical size={28} color={T.action} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                No Auto Runs Recorded in This Research Run Yet
              </div>
              <p style={{ fontSize: 13, color: T.muted, maxWidth: 520, margin: "0 auto 14px", lineHeight: 1.5 }}>
                Every time you click <strong>Auto-Optimize & Play</strong> on the Setup Screen while this Research Run is active, the run is recorded here. Or click below to run all 4 Goal Priority Rankings automatically right now.
              </p>
              {onRunBatchComparison && (
                <button
                  onClick={onRunBatchComparison}
                  disabled={isBatchRunning}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 16px",
                    borderRadius: 8,
                    border: `1px solid ${T.action}`,
                    background: T.action,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isBatchRunning ? "not-allowed" : "pointer",
                  }}
                >
                  <Sparkles size={14} />{" "}
                  {isBatchRunning ? "Running All 4 Goal Rankings…" : "Run All 4 Goal Rankings Now"}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* TAB 1: COMPARATIVE RESULTS TABLE */}
              {activeTab === "table" && (
                <div>
                  {/* Highlight Cards */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    {[
                      [
                        "Most Projects Delivered",
                        `${report.bestProjectsRun?.evaluation?.metrics?.completedCount}/${report.bestProjectsRun?.evaluation?.metrics?.maxComp}`,
                        `Run #${report.bestProjectsRun?.runNumber} (${GOAL_METADATA[report.bestProjectsRun?.goalRanking?.[0]]?.shortLabel} #1)`,
                        T.completed,
                      ],
                      [
                        "Highest Avg Alignment",
                        `${((report.bestAlignmentRun?.evaluation?.metrics?.avgAlignment || 0) * 100).toFixed(1)}%`,
                        `Run #${report.bestAlignmentRun?.runNumber} (${GOAL_METADATA[report.bestAlignmentRun?.goalRanking?.[0]]?.shortLabel} #1)`,
                        T.action,
                      ],
                      [
                        "Peak Funds Utilization",
                        `${((report.bestUtilizationRun?.evaluation?.metrics?.utilizationRate || 0) * 100).toFixed(1)}%`,
                        `Run #${report.bestUtilizationRun?.runNumber} (${money(report.bestUtilizationRun?.evaluation?.metrics?.unspentCash)} unspent)`,
                        T.suspended,
                      ],
                      [
                        "Max Social Benefits",
                        `${Math.round(report.bestBenefitsRun?.evaluation?.metrics?.totalRealizedBU || 0).toLocaleString()} BU`,
                        `Run #${report.bestBenefitsRun?.runNumber} (${money((report.bestBenefitsRun?.evaluation?.metrics?.totalRealizedBU || 0) * 0.02)} value)`,
                        T.completed,
                      ],
                    ].map(([lbl, big, sub, col]) => (
                      <div
                        key={lbl}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          background: T.panel2,
                          border: `1px solid ${T.line}`,
                        }}
                      >
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: "uppercase" }}>
                          {lbl}
                        </div>
                        <div style={{ fontSize: 21, fontWeight: 800, color: col, marginTop: 3, ...mono }}>
                          {big}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Full Comparative Table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `1.5px solid ${T.line}`, background: T.panel2, color: T.muted }}>
                          <th style={{ padding: "8px 8px", textAlign: "left" }}>Run #</th>
                          <th style={{ padding: "8px 8px", textAlign: "left" }}>Goal Priority Ranking (#1 → #4)</th>
                          <th style={{ padding: "8px 8px", textAlign: "right" }}>Sim Score</th>
                          <th style={{ padding: "8px 8px", textAlign: "right" }}>Goal Index</th>
                          <th style={{ padding: "8px 8px", textAlign: "right" }}>Completed</th>
                          <th style={{ padding: "8px 8px", textAlign: "right" }}>Avg Alignment</th>
                          <th style={{ padding: "8px 8px", textAlign: "right" }}>Funds Utilized</th>
                          <th style={{ padding: "8px 8px", textAlign: "right" }}>Unspent</th>
                          <th style={{ padding: "8px 8px", textAlign: "right" }}>Benefits (BU)</th>
                          <th style={{ padding: "8px 8px", textAlign: "center" }}>Budget / Params</th>
                          <th style={{ padding: "8px 8px", textAlign: "center" }}>Actions</th>
                          <th style={{ padding: "8px 8px", textAlign: "right" }}>Replay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => {
                          const m = e.evaluation?.metrics || {};
                          const ac = e.actionCounts || {};
                          const isTopScore = report.bestSimRun?.entryId === e.entryId;
                          const isTopProj = report.bestProjectsRun?.entryId === e.entryId;
                          const isTopAlign = report.bestAlignmentRun?.entryId === e.entryId;
                          const isTopUtil = report.bestUtilizationRun?.entryId === e.entryId;
                          const isTopBen = report.bestBenefitsRun?.entryId === e.entryId;

                          return (
                            <tr
                              key={e.entryId || e.runNumber}
                              style={{
                                borderBottom: `1px solid ${T.lineSoft}`,
                                background: isTopScore ? T.action + "0a" : "transparent",
                              }}
                            >
                              <td style={{ padding: "9px 8px", fontWeight: 800, color: T.action, ...mono }}>
                                #{e.runNumber}
                                <div style={{ fontSize: 10, color: T.faint, fontWeight: 400 }}>
                                  {e.timestamp ? new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                                </div>
                              </td>
                              <td style={{ padding: "9px 8px" }}>
                                <div style={{ fontWeight: 700, color: T.text }}>{e.label}</div>
                                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                                  {formatGoalRankingShort(e.goalRanking)}
                                </div>
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "right", ...mono }}>
                                <span style={{ fontWeight: 800, color: T.completed }}>
                                  {(e.evaluation?.simScore || 0).toFixed(1)}
                                </span>
                                <div style={{ fontSize: 10, color: T.faint }}>{e.evaluation?.band}</div>
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, color: T.action, ...mono }}>
                                {(e.evaluation?.weightedGoalScore || 0).toFixed(1)}
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "right", ...mono }}>
                                <strong style={{ color: isTopProj ? T.completed : T.text }}>
                                  {m.completedCount}/{m.maxComp}
                                </strong>
                                {isTopProj && <div style={{ fontSize: 9.5, color: T.completed, fontWeight: 700 }}>★ Max</div>}
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "right", ...mono }}>
                                <strong style={{ color: isTopAlign ? T.action : T.text }}>
                                  {((m.avgAlignment || 0) * 100).toFixed(1)}%
                                </strong>
                                {isTopAlign && <div style={{ fontSize: 9.5, color: T.action, fontWeight: 700 }}>★ Best</div>}
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "right", ...mono }}>
                                <strong style={{ color: isTopUtil ? T.completed : T.text }}>
                                  {((m.utilizationRate || 0) * 100).toFixed(1)}%
                                </strong>
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "right", color: T.muted, ...mono }}>
                                {money(m.unspentCash)}
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "right", ...mono }}>
                                <strong style={{ color: isTopBen ? T.completed : T.text }}>
                                  {Math.round(m.totalRealizedBU || 0).toLocaleString()} BU
                                </strong>
                                {isTopBen && <div style={{ fontSize: 9.5, color: T.completed, fontWeight: 700 }}>★ Peak BU</div>}
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "center", fontSize: 10.5, color: T.muted, lineHeight: 1.4, ...mono }}>
                                <div style={{ fontWeight: 700, color: T.text }}>
                                  {(e.config?.fundingGrowthRate || 0) > 0
                                    ? `${money(e.config?.nominalBudget ?? e.config?.totalBudget)}→${money(e.config?.totalBudget)}`
                                    : `${money(e.config?.totalBudget)} (${e.config?.budgetTightness ?? 1.5}×)`}{" "}
                                  · {((e.config?.annualRate || 0) * 100).toFixed(1)}% inf
                                </div>
                                <div style={{ fontSize: 10, color: T.faint }}>
                                  Grw {((e.config?.fundingGrowthRate || 0) * 100).toFixed(1)}% · {e.config?.fundingProfile || "scurve"} ({e.config?.fundingFrequency ?? 3}m) · Risk {(e.config?.riskMultiplier ?? 1).toFixed(1)}×
                                </div>
                                <div style={{ fontSize: 10, color: T.faint }}>
                                  Lag {e.config?.approvalLag ?? 0}m · Cap {e.config?.concurrentCap ? e.config.concurrentCap : "∞"} · Pol {e.config?.politicalProjects ?? 0}
                                </div>
                                <div style={{ fontSize: 10, color: T.faint }}>
                                  ARC {e.config?.arcEnabled ? "ON" : "OFF"} · Partial {e.config?.partialCreditEnabled ? "ON" : "OFF"} · #{e.seed}
                                </div>
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "center", fontSize: 11, color: T.muted, ...mono }}>
                                +{ac.add || 0} / ⚡{ac.speed || 0} / ⏳{ac.slow || 0}
                              </td>
                              <td style={{ padding: "9px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                                {onReplayRunEntry && (
                                  <button
                                    onClick={() => onReplayRunEntry(e)}
                                    title="Watch AI visually play this exact run from Month 1"
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 6,
                                      border: `1px solid ${T.action}`,
                                      background: T.action + "15",
                                      color: T.action,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      marginRight: 4,
                                    }}
                                  >
                                    ▶ Play
                                  </button>
                                )}
                                {onDeleteRunEntry && (
                                  <button
                                    onClick={() => onDeleteRunEntry(e.entryId)}
                                    title="Remove this run from Research Run"
                                    style={{
                                      padding: "4px 6px",
                                      borderRadius: 6,
                                      border: `1px solid ${T.line}`,
                                      background: "transparent",
                                      color: T.expired,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: OBSERVATIONS & ANALYSIS REPORT */}
              {activeTab === "observations" && (
                <div>
                  <div
                    style={{
                      background: T.panel2,
                      border: `1px solid ${T.line}`,
                      borderLeft: `4px solid ${T.completed}`,
                      borderRadius: 10,
                      padding: "14px 16px",
                      marginBottom: 18,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: T.completed,
                        textTransform: "uppercase",
                        letterSpacing: ".05em",
                        marginBottom: 8,
                      }}
                    >
                      Key Observations & Goal-Ranking Sensitivity Synthesis
                    </div>
                    {report.observations.map((obs, idx) => (
                      <div key={idx} style={{ marginBottom: idx < report.observations.length - 1 ? 12 : 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3 }}>
                          {idx + 1}. {obs.title}
                        </div>
                        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
                          {obs.detail}
                        </div>
                      </div>
                    ))}
                  </div>

                  <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".05em", color: T.muted, margin: "0 0 10px" }}>
                    Run-by-Run Comparative Breakdown (vs. Run #1 Baseline)
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.runNarratives.map((rn) => (
                      <div
                        key={rn.runNumber}
                        style={{
                          padding: "11px 14px",
                          borderRadius: 9,
                          background: T.panel2,
                          border: `1px solid ${T.line}`,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                          <strong style={{ fontSize: 13, color: T.action }}>
                            Run #{rn.runNumber} — {rn.label}
                          </strong>
                          <span style={{ fontSize: 11.5, color: T.muted, ...mono }}>
                            {rn.goalRankingText}
                          </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55 }}>
                          {rn.summary}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: CROSS-RUN PROJECT SELECTION MATRIX */}
              {activeTab === "matrix" && (
                <div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                    <span style={{ padding: "5px 10px", borderRadius: 8, background: T.completed + "18", color: T.completed, fontSize: 12, fontWeight: 700 }}>
                      ★ Core Anchor Projects (100% of runs): {report.projectClassification.core.length}
                    </span>
                    <span style={{ padding: "5px 10px", borderRadius: 8, background: T.action + "18", color: T.action, fontSize: 12, fontWeight: 700 }}>
                      ⇄ Goal-Sensitive Swing Projects: {report.projectClassification.swing.length}
                    </span>
                    <span style={{ padding: "5px 10px", borderRadius: 8, background: T.panel2, color: T.muted, fontSize: 12, fontWeight: 600 }}>
                      ✕ Universally Excluded (0% of runs): {report.projectClassification.excluded.length}
                    </span>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                      <thead>
                        <tr style={{ borderBottom: `1.5px solid ${T.line}`, background: T.panel2, color: T.muted }}>
                          <th style={{ padding: "7px 7px", textAlign: "left" }}>ID</th>
                          <th style={{ padding: "7px 7px", textAlign: "left" }}>Project Title</th>
                          <th style={{ padding: "7px 7px", textAlign: "right" }}>BAC</th>
                          <th style={{ padding: "7px 7px", textAlign: "right" }}>Dur</th>
                          <th style={{ padding: "7px 7px", textAlign: "right" }}>Align</th>
                          <th style={{ padding: "7px 7px", textAlign: "right" }}>BU/mo</th>
                          <th style={{ padding: "7px 7px", textAlign: "center" }}>Freq</th>
                          <th style={{ padding: "7px 7px", textAlign: "left" }}>Classification</th>
                          {entries.map((e) => (
                            <th key={e.runNumber} style={{ padding: "7px 7px", textAlign: "center", ...mono }}>
                              R#{e.runNumber}
                              <div style={{ fontSize: 9.5, fontWeight: 400 }}>
                                {GOAL_METADATA[e.goalRanking?.[0]]?.shortLabel?.split(" ")[0]}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.projectClassification.all.map((p) => {
                          const isCore = p.selectionCount === entries.length;
                          const isSwing = p.selectionCount > 0 && p.selectionCount < entries.length;
                          const badgeCol = isCore ? T.completed : isSwing ? T.action : T.faint;

                          return (
                            <tr key={p.id} style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                              <td style={{ padding: "6px 7px", fontWeight: 700, color: T.action, ...mono }}>{p.id}</td>
                              <td style={{ padding: "6px 7px", fontWeight: 600 }}>
                                {p.title}{" "}
                                {p.political && <span style={{ fontSize: 10, color: T.expired }}>(Pol)</span>}
                              </td>
                              <td style={{ padding: "6px 7px", textAlign: "right", ...mono }}>{money(p.bacInitial)}</td>
                              <td style={{ padding: "6px 7px", textAlign: "right", ...mono }}>{p.durationPlanned}m</td>
                              <td style={{ padding: "6px 7px", textAlign: "right", ...mono }}>{pct(p.alignment)}</td>
                              <td style={{ padding: "6px 7px", textAlign: "right", ...mono }}>{p.buRate}</td>
                              <td style={{ padding: "6px 7px", textAlign: "center", fontWeight: 700, color: badgeCol, ...mono }}>
                                {p.selectionCount}/{entries.length}
                              </td>
                              <td style={{ padding: "6px 7px", color: badgeCol, fontWeight: 600 }}>
                                {p.classification}
                              </td>
                              {entries.map((e) => {
                                const out = (e.projectOutcomes || []).find((o) => o.id === p.id);
                                const done = out?.state === "completed";
                                return (
                                  <td
                                    key={e.runNumber}
                                    style={{
                                      padding: "6px 7px",
                                      textAlign: "center",
                                      color: done ? T.completed : T.faint,
                                      fontWeight: done ? 700 : 400,
                                      ...mono,
                                    }}
                                  >
                                    {done ? `M${out.startMonth}→${out.completionMonth}` : "—"}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: BASELINE PORTFOLIO DATA */}
              {activeTab === "portfolio" && (
                <div>
                  <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.muted }}>
                    Snapshot of the <strong>{researchRun.portfolioName}</strong> baseline project pool ({researchRun.projectCount} candidate projects · Total Baseline BAC {money(researchRun.totalBac)} · Base Seed #{researchRun.baseSeed}) used by this Research Run.
                  </p>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `1.5px solid ${T.line}`, background: T.panel2, color: T.muted }}>
                          <th style={{ padding: "7px 8px", textAlign: "left" }}>ID</th>
                          <th style={{ padding: "7px 8px", textAlign: "left" }}>Title</th>
                          <th style={{ padding: "7px 8px", textAlign: "left" }}>Subcategory</th>
                          <th style={{ padding: "7px 8px", textAlign: "right" }}>Initial BAC</th>
                          <th style={{ padding: "7px 8px", textAlign: "right" }}>Duration</th>
                          <th style={{ padding: "7px 8px", textAlign: "right" }}>Alignment</th>
                          <th style={{ padding: "7px 8px", textAlign: "right" }}>Cost Risk</th>
                          <th style={{ padding: "7px 8px", textAlign: "right" }}>Dur Risk</th>
                          <th style={{ padding: "7px 8px", textAlign: "right" }}>ARC %</th>
                          <th style={{ padding: "7px 8px", textAlign: "right" }}>BU/mo</th>
                          <th style={{ padding: "7px 8px", textAlign: "center" }}>Political</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(researchRun.projects || []).map((p) => (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
                            <td style={{ padding: "6px 8px", fontWeight: 700, color: T.action, ...mono }}>{p.id}</td>
                            <td style={{ padding: "6px 8px", fontWeight: 600 }}>{p.title}</td>
                            <td style={{ padding: "6px 8px", color: T.muted }}>{p.subCategory}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{money(p.bacInitial)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{p.durationPlanned}m</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: T.completed, ...mono }}>
                              {pct(p.alignment)}
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>
                              {(((p.costRiskBase ?? p.costRisk ?? 0.1) * 100)).toFixed(1)}%
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>
                              {(((p.durRiskBase ?? p.durRisk ?? 0.1) * 100)).toFixed(1)}%
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>
                              {((p.arcRate || 0) * 100).toFixed(1)}%
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right", ...mono }}>{p.buRate}</td>
                            <td style={{ padding: "6px 8px", textAlign: "center" }}>
                              {p.political ? "Yes" : "No"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with Excel (.xlsx), Markdown (.md), and Batch Run actions */}
        <div
          style={{
            padding: "13px 22px",
            borderTop: `1px solid ${T.line}`,
            background: T.panel2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => exportResearchRunToExcel(researchRun)}
              disabled={entries.length === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 13px",
                borderRadius: 8,
                border: `1px solid ${T.completed}`,
                background: T.panel,
                color: T.completed,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: entries.length === 0 ? "not-allowed" : "pointer",
                opacity: entries.length === 0 ? 0.5 : 1,
              }}
            >
              <Download size={14} /> Export Excel (.xlsx)
            </button>

            <button
              onClick={() => exportResearchRunToMarkdown(researchRun)}
              disabled={entries.length === 0}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 13px",
                borderRadius: 8,
                border: `1px solid ${T.action}`,
                background: T.panel,
                color: T.action,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: entries.length === 0 ? "not-allowed" : "pointer",
                opacity: entries.length === 0 ? 0.5 : 1,
              }}
            >
              <FileText size={14} /> Export Markdown (.md)
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onRunBatchComparison && (
              <button
                onClick={onRunBatchComparison}
                disabled={isBatchRunning}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${T.action}`,
                  background: T.action,
                  color: "#fff",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: isBatchRunning ? "not-allowed" : "pointer",
                }}
              >
                <Sparkles size={14} />{" "}
                {isBatchRunning ? "Running 4-Goal Batch…" : "Run All 4 Goal Rankings Batch"}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                background: T.panel,
                color: T.text,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

