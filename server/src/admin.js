import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rateLimit } from "express-rate-limit";
import { db } from "./db.js";

export const adminRouter = express.Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";

// Generous but present — this protects against brute-forcing the admin key.
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
adminRouter.use(adminLimiter);

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  // Fail closed: if ADMIN_KEY was never set, nobody gets in (not even with a blank key).
  if (!ADMIN_KEY || typeof key !== "string" || key !== ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

adminRouter.get("/admin/summary", requireAdmin, (_req, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  const totalRuns = db.prepare("SELECT COUNT(*) c FROM runs").get().c;
  const totalPortfolios = db.prepare("SELECT COUNT(*) c FROM custom_portfolios").get().c;
  const globalPortfolios = db.prepare("SELECT COUNT(*) c FROM custom_portfolios WHERE is_global = 1").get().c;
  const byPreset = db
    .prepare(
      `SELECT preset, COUNT(*) runs, ROUND(AVG(score_final),1) avgScore, ROUND(AVG(duration_seconds)/60.0,1) avgMinutes
       FROM runs GROUP BY preset ORDER BY runs DESC`
    )
    .all();
  const topScores = db
    .prepare(
      `SELECT player_name, user_email, preset, score_final, band, ended_at
       FROM runs ORDER BY score_final DESC LIMIT 10`
    )
    .all();
  const recentRuns = db
    .prepare(
      `SELECT player_name, user_email, preset, score_final, band, ended_at, duration_seconds
       FROM runs ORDER BY ended_at DESC LIMIT 20`
    )
    .all();
  const users = db.prepare(`SELECT email, display_name, created_at, verified_at FROM users ORDER BY created_at DESC`).all();
  const portfolios = db
    .prepare(
      `SELECT id, owner_email, owner_name, name, description, project_count, total_bac, default_budget, is_global, created_at, updated_at
       FROM custom_portfolios
       ORDER BY is_global DESC, created_at DESC`
    )
    .all();

  res.json({ totalUsers, totalRuns, totalPortfolios, globalPortfolios, byPreset, topScores, recentRuns, users, portfolios });
});

adminRouter.get("/admin/portfolios", requireAdmin, (_req, res) => {
  const portfolios = db
    .prepare(
      `SELECT id, owner_email, owner_name, name, description, project_count, total_bac, default_budget, is_global, created_at, updated_at
       FROM custom_portfolios
       ORDER BY is_global DESC, created_at DESC`
    )
    .all();
  res.json({ portfolios });
});

adminRouter.get("/admin/portfolios/:id", requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM custom_portfolios WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json({ portfolio: row });
});

adminRouter.patch("/admin/portfolios/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM custom_portfolios WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const isGlobal = req.body.isGlobal !== undefined ? (req.body.isGlobal ? 1 : 0) : existing.is_global;
  const name = typeof req.body.name === "string" && req.body.name.trim() ? req.body.name.trim() : existing.name;
  const defaultBudget =
    typeof req.body.defaultBudget === "number" && req.body.defaultBudget > 0
      ? +req.body.defaultBudget.toFixed(2)
      : existing.default_budget;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE custom_portfolios SET is_global = ?, name = ?, default_budget = ?, updated_at = ? WHERE id = ?`
  ).run(isGlobal, name, defaultBudget, now, id);

  const updated = db
    .prepare(
      `SELECT id, owner_email, owner_name, name, description, project_count, total_bac, default_budget, is_global, created_at, updated_at
       FROM custom_portfolios WHERE id = ?`
    )
    .get(id);
  res.json({ ok: true, portfolio: updated });
});

adminRouter.delete("/admin/portfolios/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare("DELETE FROM custom_portfolios WHERE id = ?").run(id);
  res.json({ ok: true });
});

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

adminRouter.get("/admin/export/runs.csv", requireAdmin, (_req, res) => {
  const rows = db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.send(toCsv(rows));
});

adminRouter.get("/admin/export/users.csv", requireAdmin, (_req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.send(toCsv(rows));
});

adminRouter.get("/admin/export/portfolios.csv", requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, owner_email, owner_name, name, description, project_count, total_bac, default_budget, is_global, created_at, updated_at
       FROM custom_portfolios ORDER BY created_at DESC`
    )
    .all();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.send(toCsv(rows));
});

adminRouter.get("/admin/backup", requireAdmin, async (_req, res) => {
  const tmpFile = path.join(os.tmpdir(), `sim-backup-${Date.now()}.db`);
  try {
    await db.backup(tmpFile);
    const data = fs.readFileSync(tmpFile);
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(data);
  } catch (e) {
    console.error("[admin] backup failed:", e.message);
    res.status(500).json({ error: "backup_failed" });
  } finally {
    fs.unlink(tmpFile, () => {});
  }
});
