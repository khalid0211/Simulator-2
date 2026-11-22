import express from "express";
import crypto from "node:crypto";
import { db } from "./db.js";
import { requireAuth } from "./auth.js";

export const researchRunsRouter = express.Router();

function formatResearchRunRow(r) {
  let projects = [];
  let entries = [];
  try {
    projects = JSON.parse(r.projects_json || "[]");
  } catch {
    projects = [];
  }
  try {
    entries = JSON.parse(r.entries_json || "[]");
  } catch {
    entries = [];
  }
  return {
    id: r.id,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name || "Player",
    title: r.title,
    description: r.description || null,
    portfolioId: r.portfolio_id || "procedural",
    portfolioName: r.portfolio_name || "Procedural Pool (30 Projects)",
    projectCount: r.project_count,
    totalBac: r.total_bac,
    baseSeed: r.base_seed,
    projects,
    entries,
    runCount: entries.length,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// GET /api/research-runs — list user's research runs
researchRunsRouter.get("/research-runs", requireAuth, (req, res) => {
  const email = req.user.email.toLowerCase();
  const rows = db
    .prepare(
      `SELECT * FROM research_runs
       WHERE LOWER(owner_email) = ?
       ORDER BY updated_at DESC`
    )
    .all(email);
  res.json({ researchRuns: rows.map(formatResearchRunRow) });
});

// POST /api/research-runs — create a new research run
researchRunsRouter.post("/research-runs", requireAuth, (req, res) => {
  const email = req.user.email.toLowerCase();
  const userRow = db
    .prepare("SELECT display_name FROM users WHERE LOWER(email) = ?")
    .get(email);

  const {
    id: clientProvidedId,
    title,
    description,
    ownerName,
    portfolioId,
    portfolioName,
    baseSeed,
    projects = [],
    entries = [],
  } = req.body || {};

  if (!title || typeof title !== "string" || !Array.isArray(projects) || projects.length === 0) {
    return res.status(400).json({ error: "invalid_research_run" });
  }

  const id = clientProvidedId || crypto.randomUUID();
  const creatorName = ownerName || userRow?.display_name || email;
  const totalBac = +projects.reduce((s, p) => s + Number(p.bacInitial || 0), 0).toFixed(2);
  const now = new Date().toISOString();
  const validEntries = Array.isArray(entries) ? entries : [];

  db.prepare(
    `INSERT OR REPLACE INTO research_runs (
      id, owner_email, owner_name, title, description,
      portfolio_id, portfolio_name, project_count, total_bac,
      base_seed, projects_json, entries_json, run_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    email,
    creatorName,
    title.trim().slice(0, 140),
    description ? String(description).trim().slice(0, 400) : null,
    portfolioId || "procedural",
    (portfolioName || "Random Procedural Pool").slice(0, 140),
    projects.length,
    totalBac,
    baseSeed != null ? Number(baseSeed) : null,
    JSON.stringify(projects),
    JSON.stringify(validEntries),
    validEntries.length,
    now,
    now
  );

  const row = db.prepare("SELECT * FROM research_runs WHERE id = ?").get(id);
  res.json({ ok: true, researchRun: formatResearchRunRow(row) });
});

// POST /api/research-runs/:id/entries — append one or more auto-run results to a research run
researchRunsRouter.post("/research-runs/:id/entries", requireAuth, (req, res) => {
  const { id } = req.params;
  const email = req.user.email.toLowerCase();
  const existing = db.prepare("SELECT * FROM research_runs WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.owner_email.toLowerCase() !== email) {
    return res.status(403).json({ error: "forbidden" });
  }

  let currentEntries = [];
  try {
    currentEntries = JSON.parse(existing.entries_json || "[]");
  } catch {
    currentEntries = [];
  }

  const incoming = Array.isArray(req.body?.entries)
    ? req.body.entries
    : req.body?.entry
    ? [req.body.entry]
    : [];

  for (const item of incoming) {
    currentEntries.push({
      ...item,
      entryId: item.entryId || crypto.randomUUID(),
      runNumber: currentEntries.length + 1,
      timestamp: item.timestamp || new Date().toISOString(),
    });
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE research_runs
     SET entries_json = ?, run_count = ?, updated_at = ?
     WHERE id = ?`
  ).run(JSON.stringify(currentEntries), currentEntries.length, now, id);

  const updated = db.prepare("SELECT * FROM research_runs WHERE id = ?").get(id);
  res.json({ ok: true, researchRun: formatResearchRunRow(updated) });
});

// DELETE /api/research-runs/:id/entries/:entryId — delete one entry from a research run
researchRunsRouter.delete("/research-runs/:id/entries/:entryId", requireAuth, (req, res) => {
  const { id, entryId } = req.params;
  const email = req.user.email.toLowerCase();
  const existing = db.prepare("SELECT * FROM research_runs WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.owner_email.toLowerCase() !== email) {
    return res.status(403).json({ error: "forbidden" });
  }

  let currentEntries = [];
  try {
    currentEntries = JSON.parse(existing.entries_json || "[]");
  } catch {
    currentEntries = [];
  }

  const filtered = currentEntries
    .filter((e) => e.entryId !== entryId)
    .map((e, i) => ({ ...e, runNumber: i + 1 }));

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE research_runs
     SET entries_json = ?, run_count = ?, updated_at = ?
     WHERE id = ?`
  ).run(JSON.stringify(filtered), filtered.length, now, id);

  const updated = db.prepare("SELECT * FROM research_runs WHERE id = ?").get(id);
  res.json({ ok: true, researchRun: formatResearchRunRow(updated) });
});

// DELETE /api/research-runs/:id — delete an entire research run
researchRunsRouter.delete("/research-runs/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const email = req.user.email.toLowerCase();
  const existing = db.prepare("SELECT * FROM research_runs WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.owner_email.toLowerCase() !== email) {
    return res.status(403).json({ error: "forbidden" });
  }

  db.prepare("DELETE FROM research_runs WHERE id = ?").run(id);
  res.json({ ok: true });
});
