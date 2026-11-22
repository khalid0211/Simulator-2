import express from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuth } from "./auth.js";

export const runsRouter = express.Router();

const num = z.number().finite();
const runSchema = z.object({
  playerName: z.string().max(120).optional(),
  runName: z.string().max(120).optional(),
  preset: z.string().max(40).optional(),
  config: z.any().optional(),
  seed: z.number().int().optional(),
  scenarioKey: z.string().max(160).optional().nullable(),
  optimalScore: num.optional().nullable(),
  relativeScore: num.optional().nullable(),
  score: z.object({
    final: num,
    band: z.string().max(40).optional(),
    delivery: num.optional(),
    alignment: num.optional(),
    efficiency: num.optional(),
    benefits: num.optional(),
    raw: num.optional(),
    penalty: num.optional(),
    completed: num.optional(),
    abandoned: num.optional(),
    expired: num.optional(),
    arcReductions: num.optional(),
    insolvent: z.boolean().optional(),
    benefitsBU: num.optional(),
    benefitsPotentialBU: num.optional(),
    optimalScore: num.optional().nullable(),
    relativeScore: num.optional().nullable(),
  }),
  endMonth: z.number().int().optional(),
  startedAt: z.number().int().optional(),
  endedAt: z.number().int().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

const insertRun = db.prepare(`
  INSERT INTO runs (
    id, user_email, player_name, run_name, preset, config_json, seed,
    scenario_key, optimal_score, relative_score,
    score_final, band, delivery, alignment, efficiency, benefits, raw, penalty,
    completed, abandoned, expired, arc_reductions, insolvent, end_month,
    benefits_bu, benefits_potential_bu, started_at, ended_at, duration_seconds,
    ip, user_agent, created_at
  ) VALUES (
    @id, @email, @playerName, @runName, @preset, @config, @seed,
    @scenarioKey, @optimalScore, @relativeScore,
    @final, @band, @delivery, @alignment, @efficiency, @benefits, @raw, @penalty,
    @completed, @abandoned, @expired, @arcReductions, @insolvent, @endMonth,
    @benefitsBU, @benefitsPotentialBU, @startedAt, @endedAt, @durationSeconds,
    @ip, @ua, @createdAt
  )
`);

// GET /api/benchmarks/:scenarioKey — look up stored optimal benchmark for a scenario
runsRouter.get("/benchmarks/:scenarioKey", (req, res) => {
  const key = String(req.params.scenarioKey || "").trim();
  if (!key) return res.status(400).json({ error: "missing_scenario_key" });

  const row = db
    .prepare("SELECT * FROM scenario_benchmarks WHERE scenario_key = ?")
    .get(key);

  if (!row) {
    return res.json({ found: false, benchmark: null });
  }

  let parsed = null;
  try {
    parsed = JSON.parse(row.benchmark_json);
  } catch {}

  return res.json({
    found: true,
    benchmark: {
      ...(parsed || {}),
      scenarioKey: row.scenario_key,
      optimalScore: row.optimal_score,
      optimalBand: row.optimal_band,
      completed: row.completed,
      avgAlignment: row.avg_alignment,
      utilizationRate: row.utilization_rate,
      benefitsBU: row.benefits_bu,
      delivery: row.delivery_pts,
      alignment: row.alignment_pts,
      efficiency: row.efficiency_pts,
      benefits: row.benefits_pts,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isCached: true,
    },
  });
});

// POST /api/benchmarks — store or update optimal benchmark for a scenario
runsRouter.post("/benchmarks", (req, res) => {
  const { scenarioKey, benchmark } = req.body || {};
  const key = String(scenarioKey || benchmark?.scenarioKey || "").trim();
  const optScore = Number(benchmark?.optimalScore);

  if (!key || !Number.isFinite(optScore) || optScore <= 0) {
    return res.status(400).json({ error: "invalid_benchmark" });
  }

  const existing = db
    .prepare("SELECT * FROM scenario_benchmarks WHERE scenario_key = ?")
    .get(key);

  const now = new Date().toISOString();

  // Only overwrite if this is the first time seeing the scenario, or if a strictly better optimal score was found
  if (!existing) {
    const cleanPayload = {
      ...benchmark,
      scenarioKey: key,
      optimalScore: +optScore.toFixed(2),
      createdAt: now,
      updatedAt: now,
    };
    db.prepare(
      `INSERT INTO scenario_benchmarks (
        scenario_key, seed, preset, portfolio_id, portfolio_name, total_budget,
        optimal_score, optimal_band, completed, avg_alignment, utilization_rate,
        benefits_bu, delivery_pts, alignment_pts, efficiency_pts, benefits_pts,
        benchmark_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      key,
      benchmark.seed ?? null,
      benchmark.preset ?? "custom",
      benchmark.portfolioId ?? "procedural",
      benchmark.portfolioName ?? null,
      benchmark.totalBudget ?? null,
      +optScore.toFixed(2),
      benchmark.optimalBand ?? null,
      benchmark.completed ?? 0,
      benchmark.avgAlignment ?? 0,
      benchmark.utilizationRate ?? 0,
      benchmark.benefitsBU ?? 0,
      benchmark.delivery ?? 0,
      benchmark.alignment ?? 0,
      benchmark.efficiency ?? 0,
      benchmark.benefits ?? 0,
      JSON.stringify(cleanPayload),
      now,
      now
    );
    return res.json({
      ok: true,
      wasFirstTime: true,
      benchmark: { ...cleanPayload, isCached: false },
    });
  } else if (optScore > existing.optimal_score + 0.05) {
    const cleanPayload = {
      ...benchmark,
      scenarioKey: key,
      optimalScore: +optScore.toFixed(2),
      createdAt: existing.created_at,
      updatedAt: now,
    };
    db.prepare(
      `UPDATE scenario_benchmarks
       SET optimal_score = ?, optimal_band = ?, completed = ?, avg_alignment = ?,
           utilization_rate = ?, benefits_bu = ?, delivery_pts = ?, alignment_pts = ?,
           efficiency_pts = ?, benefits_pts = ?, benchmark_json = ?, updated_at = ?
       WHERE scenario_key = ?`
    ).run(
      +optScore.toFixed(2),
      benchmark.optimalBand ?? existing.optimal_band,
      benchmark.completed ?? existing.completed,
      benchmark.avgAlignment ?? existing.avg_alignment,
      benchmark.utilizationRate ?? existing.utilization_rate,
      benchmark.benefitsBU ?? existing.benefits_bu,
      benchmark.delivery ?? existing.delivery_pts,
      benchmark.alignment ?? existing.alignment_pts,
      benchmark.efficiency ?? existing.efficiency_pts,
      benchmark.benefits ?? existing.benefits_pts,
      JSON.stringify(cleanPayload),
      now,
      key
    );
    return res.json({
      ok: true,
      wasFirstTime: false,
      benchmark: { ...cleanPayload, isCached: true },
    });
  }

  let existingParsed = {};
  try {
    existingParsed = JSON.parse(existing.benchmark_json || "{}");
  } catch {}

  return res.json({
    ok: true,
    wasFirstTime: false,
    benchmark: {
      ...existingParsed,
      scenarioKey: existing.scenario_key,
      optimalScore: existing.optimal_score,
      optimalBand: existing.optimal_band,
      isCached: true,
    },
  });
});

runsRouter.post("/runs", requireAuth, (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_run", detail: parsed.error.flatten() });
  const d = parsed.data;
  const s = d.score;
  const id = crypto.randomUUID();

  const scenarioKey = d.scenarioKey || null;
  let optimalScore = d.optimalScore ?? s.optimalScore ?? null;

  if (scenarioKey) {
    const bm = db
      .prepare("SELECT optimal_score FROM scenario_benchmarks WHERE scenario_key = ?")
      .get(scenarioKey);
    if (bm && Number.isFinite(bm.optimal_score)) {
      optimalScore = Math.max(bm.optimal_score, optimalScore || 0);
      // If a valid human or AI run beat the stored optimal score, update the stored benchmark score
      if (s.final > bm.optimal_score + 0.05) {
        optimalScore = +s.final.toFixed(2);
        db.prepare(
          "UPDATE scenario_benchmarks SET optimal_score = ?, updated_at = ? WHERE scenario_key = ?"
        ).run(optimalScore, new Date().toISOString(), scenarioKey);
      }
    }
  }

  const relativeScore =
    optimalScore && optimalScore > 0
      ? +((s.final / optimalScore) * 100).toFixed(1)
      : d.relativeScore ?? s.relativeScore ?? null;

  insertRun.run({
    id,
    email: req.user.email,
    playerName: d.playerName ?? null,
    runName: d.runName ?? null,
    preset: d.preset ?? null,
    config: d.config != null ? JSON.stringify(d.config) : null,
    seed: d.seed ?? null,
    scenarioKey,
    optimalScore,
    relativeScore,
    final: s.final,
    band: s.band ?? null,
    delivery: s.delivery ?? null,
    alignment: s.alignment ?? null,
    efficiency: s.efficiency ?? null,
    benefits: s.benefits ?? null,
    raw: s.raw ?? null,
    penalty: s.penalty ?? null,
    completed: s.completed ?? null,
    abandoned: s.abandoned ?? null,
    expired: s.expired ?? null,
    arcReductions: s.arcReductions ?? null,
    insolvent: s.insolvent ? 1 : 0,
    endMonth: d.endMonth ?? null,
    benefitsBU: s.benefitsBU ?? null,
    benefitsPotentialBU: s.benefitsPotentialBU ?? null,
    startedAt: d.startedAt ?? null,
    endedAt: d.endedAt ?? null,
    durationSeconds: d.durationSeconds ?? null,
    ip: req.ip ?? null,
    ua: (req.headers["user-agent"] || "").slice(0, 300),
    createdAt: new Date().toISOString(),
  });

  res.json({ ok: true, id, optimalScore, relativeScore });
});

runsRouter.get("/leaderboard", (req, res) => {
  const preset = String(req.query.preset || "all");
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const filtered = preset && preset !== "all";
  const rows = db
    .prepare(`
      SELECT player_name AS playerName, run_name AS runName, preset,
             score_final AS score, optimal_score AS optimalScore, relative_score AS relativeScore,
             band, delivery, alignment, efficiency,
             completed, abandoned, expired,
             ended_at AS endedAt, duration_seconds AS durationSeconds
      FROM runs
      ${filtered ? "WHERE preset = ?" : ""}
      ORDER BY score_final DESC
      LIMIT ?
    `)
    .all(...(filtered ? [preset, limit] : [limit]));
  res.json({ rows });
});
