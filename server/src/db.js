import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(__dirname, "..", "data", "sim.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  email        TEXT PRIMARY KEY,
  display_name TEXT,
  created_at   TEXT NOT NULL,
  verified_at  TEXT
);

CREATE TABLE IF NOT EXISTS email_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email);

CREATE TABLE IF NOT EXISTS runs (
  id                    TEXT PRIMARY KEY,
  user_email            TEXT NOT NULL,
  player_name           TEXT,
  run_name              TEXT,
  preset                TEXT,
  config_json           TEXT,
  seed                  INTEGER,
  score_final           REAL,
  band                  TEXT,
  delivery              REAL,
  alignment             REAL,
  efficiency            REAL,
  benefits              REAL,
  raw                   REAL,
  penalty               REAL,
  completed             INTEGER,
  abandoned             INTEGER,
  expired               INTEGER,
  arc_reductions        INTEGER,
  insolvent             INTEGER,
  end_month             INTEGER,
  benefits_bu           REAL,
  benefits_potential_bu REAL,
  started_at            INTEGER,
  ended_at              INTEGER,
  duration_seconds      INTEGER,
  ip                    TEXT,
  user_agent            TEXT,
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_preset_score ON runs(preset, score_final DESC);
CREATE INDEX IF NOT EXISTS idx_runs_email ON runs(user_email);

CREATE TABLE IF NOT EXISTS custom_portfolios (
  id             TEXT PRIMARY KEY,
  owner_email    TEXT NOT NULL,
  owner_name     TEXT,
  name           TEXT NOT NULL,
  description    TEXT,
  project_count  INTEGER NOT NULL,
  total_bac      REAL NOT NULL,
  default_budget REAL NOT NULL,
  projects_json  TEXT NOT NULL,
  is_global      INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portfolios_owner ON custom_portfolios(owner_email);
CREATE INDEX IF NOT EXISTS idx_portfolios_global ON custom_portfolios(is_global);

CREATE TABLE IF NOT EXISTS research_runs (
  id              TEXT PRIMARY KEY,
  owner_email     TEXT NOT NULL,
  owner_name      TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  portfolio_id    TEXT,
  portfolio_name  TEXT NOT NULL,
  project_count   INTEGER NOT NULL,
  total_bac       REAL NOT NULL,
  base_seed       INTEGER,
  projects_json   TEXT NOT NULL,
  entries_json    TEXT NOT NULL DEFAULT '[]',
  run_count       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_runs_owner ON research_runs(owner_email);

CREATE TABLE IF NOT EXISTS scenario_benchmarks (
  scenario_key        TEXT PRIMARY KEY,
  seed                INTEGER,
  preset              TEXT,
  portfolio_id        TEXT,
  portfolio_name      TEXT,
  total_budget        REAL,
  optimal_score       REAL NOT NULL,
  optimal_band        TEXT,
  completed           INTEGER,
  avg_alignment       REAL,
  utilization_rate    REAL,
  benefits_bu         REAL,
  delivery_pts        REAL,
  alignment_pts       REAL,
  efficiency_pts      REAL,
  benefits_pts        REAL,
  benchmark_json      TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
`);

for (const colDef of [
  "scenario_key TEXT",
  "optimal_score REAL",
  "relative_score REAL",
]) {
  try {
    db.exec(`ALTER TABLE runs ADD COLUMN ${colDef}`);
  } catch {}
}
