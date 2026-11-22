import express from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";
import { requireAuth } from "./auth.js";

export const portfoliosRouter = express.Router();

const projectTemplateSchema = z.object({
  id: z.string().max(20).optional(),
  title: z.string().trim().min(1).max(120),
  category: z.string().max(100),
  subCategory: z.string().max(100),
  arcRate: z.number().min(0).max(1),
  bacInitial: z.number().min(0.1).max(500),
  alignment: z.number().min(0.01).max(1),
  durationPlanned: z.number().int().min(1).max(60),
  costRiskBase: z.number().min(0).max(0.4).optional(),
  durRiskBase: z.number().min(0).max(0.4).optional(),
  costRisk: z.number().min(0).max(0.4),
  durRisk: z.number().min(0).max(0.4),
  buRate: z.number().min(0).optional(),
  political: z.boolean().optional(),
});

const createPortfolioSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional().nullable(),
  defaultBudget: z.number().positive().max(10000),
  projects: z.array(projectTemplateSchema).min(1).max(50),
});

const updatePortfolioSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(300).optional().nullable(),
  defaultBudget: z.number().positive().max(10000).optional(),
  projects: z.array(projectTemplateSchema).min(1).max(50).optional(),
});

function formatPortfolioRow(r, viewerEmail) {
  let projects = [];
  try {
    projects = JSON.parse(r.projects_json || "[]");
  } catch {
    projects = [];
  }
  return {
    id: r.id,
    ownerEmail: r.owner_email,
    ownerName: r.owner_name || null,
    name: r.name,
    description: r.description || null,
    projectCount: r.project_count,
    totalBac: r.total_bac,
    defaultBudget: r.default_budget,
    projects,
    isGlobal: Boolean(r.is_global),
    isOwner: viewerEmail ? r.owner_email.toLowerCase() === viewerEmail.toLowerCase() : false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// GET /api/portfolios — returns user's own portfolios + all global portfolios
portfoliosRouter.get("/portfolios", requireAuth, (req, res) => {
  const email = req.user.email.toLowerCase();
  const rows = db
    .prepare(
      `SELECT * FROM custom_portfolios
       WHERE LOWER(owner_email) = ? OR is_global = 1
       ORDER BY is_global DESC, updated_at DESC`
    )
    .all(email);
  res.json({ portfolios: rows.map((r) => formatPortfolioRow(r, email)) });
});

// POST /api/portfolios — create a new custom portfolio linked to user account
portfoliosRouter.post("/portfolios", requireAuth, (req, res) => {
  const parsed = createPortfolioSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_portfolio", detail: parsed.error.flatten() });
  }
  const { name, description, defaultBudget, projects } = parsed.data;
  const email = req.user.email.toLowerCase();
  const userRow = db.prepare("SELECT display_name FROM users WHERE LOWER(email) = ?").get(email);
  const ownerName = userRow?.display_name || null;

  // Normalize project IDs P01..PXX
  const normalizedProjects = projects.map((p, idx) => ({
    ...p,
    id: "P" + String(idx + 1).padStart(2, "0"),
    costRiskBase: p.costRiskBase ?? p.costRisk,
    durRiskBase: p.durRiskBase ?? p.durRisk,
    political: Boolean(p.political),
  }));

  const totalBac = +normalizedProjects.reduce((sum, p) => sum + p.bacInitial, 0).toFixed(2);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO custom_portfolios (
      id, owner_email, owner_name, name, description, project_count,
      total_bac, default_budget, projects_json, is_global, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    email,
    ownerName,
    name,
    description || null,
    normalizedProjects.length,
    totalBac,
    +defaultBudget.toFixed(2),
    JSON.stringify(normalizedProjects),
    now,
    now
  );

  const created = db.prepare("SELECT * FROM custom_portfolios WHERE id = ?").get(id);
  res.json({ ok: true, portfolio: formatPortfolioRow(created, email) });
});

// PUT /api/portfolios/:id — update user's own portfolio
portfoliosRouter.put("/portfolios/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const email = req.user.email.toLowerCase();
  const existing = db.prepare("SELECT * FROM custom_portfolios WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.owner_email.toLowerCase() !== email) {
    return res.status(403).json({ error: "forbidden" });
  }

  const parsed = updatePortfolioSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_portfolio", detail: parsed.error.flatten() });
  }

  const d = parsed.data;
  let normalizedProjects = null;
  let totalBac = existing.total_bac;
  let projectCount = existing.project_count;

  if (d.projects) {
    normalizedProjects = d.projects.map((p, idx) => ({
      ...p,
      id: "P" + String(idx + 1).padStart(2, "0"),
      costRiskBase: p.costRiskBase ?? p.costRisk,
      durRiskBase: p.durRiskBase ?? p.durRisk,
      political: Boolean(p.political),
    }));
    totalBac = +normalizedProjects.reduce((sum, p) => sum + p.bacInitial, 0).toFixed(2);
    projectCount = normalizedProjects.length;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE custom_portfolios
     SET name = ?, description = ?, default_budget = ?, project_count = ?, total_bac = ?, projects_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    d.name ?? existing.name,
    d.description !== undefined ? d.description : existing.description,
    d.defaultBudget != null ? +d.defaultBudget.toFixed(2) : existing.default_budget,
    projectCount,
    totalBac,
    normalizedProjects ? JSON.stringify(normalizedProjects) : existing.projects_json,
    now,
    id
  );

  const updated = db.prepare("SELECT * FROM custom_portfolios WHERE id = ?").get(id);
  res.json({ ok: true, portfolio: formatPortfolioRow(updated, email) });
});

// DELETE /api/portfolios/:id — delete user's own portfolio
portfoliosRouter.delete("/portfolios/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const email = req.user.email.toLowerCase();
  const existing = db.prepare("SELECT * FROM custom_portfolios WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.owner_email.toLowerCase() !== email) {
    return res.status(403).json({ error: "forbidden" });
  }
  db.prepare("DELETE FROM custom_portfolios WHERE id = ?").run(id);
  res.json({ ok: true });
});
