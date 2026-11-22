# Portfolio Simulator — Complete Full-Stack Specification (Build-From-Scratch Blueprint)

**Version:** 7.0 (Full-Stack Edition — Client Engine, Excel Import/Export, Custom & Global Portfolios, 12-Archetype 3D Development Map, Email Auth & Shared Leaderboard Backend)  
**Target Stack:** React 19 + Vite 8 + Recharts 3 + React Three Fiber / Three.js + SheetJS (`xlsx`) (Frontend) · Node.js + Express + `better-sqlite3` + Nodemailer + JWT + Zod (Backend)  
**Purpose:** Definitive architectural, mathematical, data-model, authentication, Excel import/export, custom portfolio management, 3D visual modeling, and UI/UX specification containing every formula, constant, schema, API contract, and visual rule required to develop the Portfolio Simulator application from scratch.

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Authentication, Login & Admin System](#2-authentication-login--admin-system)
3. [Database Schema & Backend API Specification](#3-database-schema--backend-api-specification)
4. [Complete Client Data Structures](#4-complete-client-data-structures)
5. [Simulation Engine & Mathematical Logic](#5-simulation-engine--mathematical-logic)
6. [Excel Export, Custom Portfolio Import & Global Sharing System](#6-excel-export-custom-portfolio-import--global-sharing-system)
7. [Scoring, Benchmarking & Rule-Based Coaching Engines](#7-scoring-benchmarking--rule-based-coaching-engines)
8. [UI Design System, Themes & Color Palettes](#8-ui-design-system-themes--color-palettes)
9. [Screen-by-Screen & Component-by-Component UI Specification](#9-screen-by-screen--component-by-component-ui-specification)
10. [3D Development Map Specification (`src/devmap/`)](#10-3d-development-map-specification-srcdevmap)
11. [Admin Dashboard UI (`/admin`)](#11-admin-dashboard-ui-admin)
12. [Project Directory Structure, Environment Variables & Deployment](#12-project-directory-structure-environment-variables--deployment)

---

## 1. System Overview & Architecture

The **Portfolio Simulator** is an interactive training simulation that places the user in the role of a public-sector Portfolio Manager over a **60-month horizon** (5 years). From either a randomly generated pool of **30 candidate projects** across **3 public-sector categories** and **12 subcategories** — or a **user-imported / admin-shared custom portfolio of up to 50 projects** with a user-configurable total budget — the player must select, fund, accelerate, slow down, suspend, resume, or abandon projects within a constrained, inflating budget released in periodic tranches.

### Key Architectural Characteristics

- **Deterministic Client-Side Simulation Engine:** All simulation math, project generation, S-curve cash-flow projections, risk milestone rolls, rule-based hints, mid-run PMO status reports, and post-run assessments run 100% deterministically in the browser using a seeded Linear Congruential Generator (LCG).
- **Excel (`.xlsx`) Export & Custom Portfolio Import (up to 50 Projects):**
  - Any project pool (30 procedural projects or up to 50 custom projects) can be exported to an `.xlsx` workbook with a standardized 12-column schema (`Projects_Baseline`), plus full run-outcome sheets (`Final_Outcomes`, `Monthly_Cash_Flow`, `Decisions_Log`) when exported mid-run or from the Debrief screen.
  - In **Custom Mode**, players can import `.xlsx` files in the exact same 12-column format (1 to 50 projects), review/edit rows inline in a validation preview modal, set a custom **Total Available Budget ($M)**, and save the portfolio to their user account.
  - Saved portfolios persist in SQLite tied to the user's verified email account. Administrators can view all user portfolios in `/admin` and mark any portfolio as **Global** (`is_global = 1`), making it selectable by all users in Custom Mode.
- **Realistic 12-Archetype 3D Development Map:**
  - The 3D Development Map renders distinct, multi-mesh architectural models for each of the **12 public-sector subcategories** (e.g., highway viaducts, arch-gravity dams with reservoirs, H-plan hospitals with helipads, U-shaped school campuses with sports fields, sawtooth polytechnic workshops, arched greenhouses, barns with twin silos, terraced forestry plots with lookout towers) alongside visual construction lifecycle states (wireframe blueprints for Available, fenced earthworks for Pending, rising structures with animated rotating tower cranes for Active, amber beacons for Suspended, landscaped grounds for Completed).
- **Passwordless Email Registration & JWT Gate:** Before starting a run, players register with their display name and email address. The backend sends a 6-digit verification code via SMTP, verifies ownership, stores the user in SQLite, and returns a long-lived JWT (default 365 days) stored in `localStorage`.
- **Hybrid Shared + Offline Leaderboard:** Completed runs are automatically POSTed to the Express/SQLite backend (`POST /api/runs`) and persisted locally in `localStorage` (`portfolio_sim_leaderboard_v1`, up to 500 runs) as an offline fallback.
- **Admin Usage & Portfolio Portal:** A password-protected (`X-Admin-Key`) admin dashboard at `/admin` provides summary metrics, mode breakdowns, top scores, recent runs, verified user lists, **Custom Portfolio management (with Global toggle & Excel/JSON export)**, CSV exports, and live SQLite WAL-safe database backups.

---

## 2. Authentication, Login & Admin System

### 2.1 Player Login / Registration Flow (Passwordless Email OTP)

1. **Gate on Setup Screen:** The **Start new run** button on the Setup Screen is disabled (`"Register to start"`) until a valid auth object `{ token, email, name }` is present in `localStorage` under key `portfolio_sim_auth_v1`.
2. **Step 1 — Request Verification Code (`authStep === "idle"`):**
   - Inputs:
     - **Player Name:** Text input (`placeholder="Your name for the leaderboard"`, trimmed, 1–60 chars, required).
     - **Email Address:** Email input (`placeholder="you@example.com"`, trimmed, lowercased, max 200 chars, required).
   - Action: Clicking **Register** calls `POST /api/auth/request-code` with `{ email }`.
   - Server Action:
     - Validates email with Zod.
     - Enforces **per-IP rate limit** (30 requests / hour via `express-rate-limit`) and **per-email throttle** (max 5 codes generated for that email in the last 60 minutes).
     - Generates a 6-digit zero-padded random integer (`crypto.randomInt(0, 1_000_000)`).
     - Hashes the code with SHA-256 (`crypto.createHash("sha256").update(String(code)).digest("hex")`). **Plaintext codes are never stored in the database.**
     - Inserts a record into `email_codes` with `expires_at = Date.now() + CODE_TTL_MIN * 60 * 1000` (default 10 minutes) and `attempts = 0`.
     - Sends the code via Nodemailer SMTP (or logs `[email] verification code for <email>: <code>` to console when in dev mode or when SMTP is unconfigured).
   - UI transitions to `authStep = "code-sent"`.
3. **Step 2 — Verify Code (`authStep === "code-sent"`):**
   - Input: 6-digit numeric input (`inputMode="numeric"`, strips non-digits, max 6 chars). Includes a `"Change email"` link to reset back to Step 1.
   - Action: Clicking **Verify & register** calls `POST /api/auth/verify` with `{ email, code, name }`.
   - Server Action:
     - Looks up the latest unconsumed `email_codes` row for `email` (`WHERE email = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`).
     - Checks:
       - If no row exists → `400 { error: "no_code" }`
       - If `row.attempts >= 5` → `429 { error: "too_many_attempts" }`
       - If `row.expires_at < Date.now()` → `400 { error: "expired" }`
       - If `row.code_hash !== sha256(code)` → increments `attempts` by 1 and returns `400 { error: "wrong_code" }`
     - Marks `consumed_at = new Date().toISOString()`.
     - Upserts `users` table: sets `verified_at = nowIso()` and `display_name = name || existing.display_name || null`.
     - Signs JWT: `jwt.sign({ email }, JWT_SECRET, { expiresIn: "${TOKEN_TTL_DAYS}d" })` (default 365 days).
     - Returns `200 { token, email, name: displayName }`.
4. **Step 3 — Authenticated State & Un-registering:**
   - Frontend saves `{ token, email, name }` to `localStorage["portfolio_sim_auth_v1"]`.
   - Displays a green banner: `✓ Registered as <name> — <email>` with an **Un-register** link.
   - Automatically fetches available user & global portfolios via `GET /api/portfolios`.
   - Clicking **Un-register** clears `localStorage["portfolio_sim_auth_v1"]` and resets the form so the user (or a new player) can register with a different name/email.
5. **Client Error Message Mapping (`AUTH_ERRORS`):**
   - `invalid_email`: `"That doesn't look like a valid email address."`
   - `too_many_requests`: `"Too many codes requested — please wait a while."`
   - `email_failed`: `"Couldn't send the email. Please try again shortly."`
   - `no_code`: `"Request a code first."`
   - `wrong_code`: `"That code isn't right — check it and try again."`
   - `expired`: `"That code has expired — request a new one."`
   - `too_many_attempts`: `"Too many attempts — request a new code."`
   - Fallback: `"Something went wrong. Please try again."`

### 2.2 Admin Shortcut & Admin Authentication

- **Admin Shortcut in Setup UI:** When the signed-in user's email matches `ADMIN_EMAIL` (`"khalid0211@gmail.com"`), an **Admin** link (`target="_blank"`) is rendered next to the **Un-register** button pointing to `ADMIN_URL` (`/admin`).
- **Admin Gate (`requireAdmin` middleware):**
  - All `/api/admin/*` endpoints require header `X-Admin-Key: <ADMIN_KEY>`.
  - **Fail-closed security:** If `process.env.ADMIN_KEY` is empty or unset on the server, all admin requests return `401 { error: "unauthorized" }` even if an empty header is sent.
  - Rate-limited to 200 requests per 15-minute window per IP.
  - The `/admin` frontend stores the entered admin key in `localStorage["sim_admin_key"]` and auto-signs in on subsequent visits.

### 2.3 Local Development Credentials (`.env` defaults)

For local development (`server/.env`):
- **Backend Port:** `4000` (proxied via Vite dev server at `http://localhost:5173/api` and `http://localhost:5173/admin`)
- **Local Dev `JWT_SECRET`:** `test-jwt-secret-for-local-dev-only-1234567890`
- **Local Dev `ADMIN_KEY`:** `test-admin-key-123`
- **Local Dev OTP Behavior:** When `NODE_ENV !== "production"` or `SMTP_*` credentials are blank, verification codes are printed directly to the server terminal:
  `[email] verification code for you@example.com: 123456`

---

## 3. Database Schema & Backend API Specification

### 3.1 SQLite Database Configuration (`server/src/db.js`)

The backend uses `better-sqlite3` with WAL mode and foreign keys enabled:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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
```

### 3.2 REST API Endpoints

| Method | Path | Auth | Request Body / Query | Response |
|---|---|---|---|---|
| `GET` | `/api/health` | Public | — | `{ ok: true, ts: <epoch_ms> }` |
| `POST` | `/api/auth/request-code` | Public (Rate-limited) | `{ email: string }` | `{ ok: true }` or `400/429/502 { error }` |
| `POST` | `/api/auth/verify` | Public | `{ email: string, code: "123456", name?: string }` | `{ token: string, email: string, name: string \| null }` |
| `POST` | `/api/runs` | `Bearer <JWT>` | Run payload (see below) | `{ ok: true, id: "<uuid>" }` |
| `GET` | `/api/leaderboard` | Public | `?preset=all\|learning\|standard\|advanced\|custom&limit=50` (max 200) | `{ rows: LeaderboardRow[] }` |
| `GET` | `/api/portfolios` | `Bearer <JWT>` | — | `{ portfolios: CustomPortfolioSummary[] }` (where `owner_email = user.email OR is_global = 1`, includes `projects` array) |
| `POST` | `/api/portfolios` | `Bearer <JWT>` | `{ name, description?, defaultBudget, projects: ProjectTemplate[] }` (1–50 projects) | `{ ok: true, portfolio: CustomPortfolio }` |
| `PUT` | `/api/portfolios/:id` | `Bearer <JWT>` | `{ name?, description?, defaultBudget?, projects?: ProjectTemplate[] }` (owner only) | `{ ok: true, portfolio: CustomPortfolio }` |
| `DELETE` | `/api/portfolios/:id` | `Bearer <JWT>` | — (owner only; cannot delete if `is_global = 1` unless admin) | `{ ok: true }` |
| `GET` | `/admin` | Public HTML | — | Serves `server/public/admin.html` |
| `GET` | `/api/admin/summary` | `X-Admin-Key` | — | `{ totalUsers, totalRuns, totalPortfolios, byPreset, topScores, recentRuns, users, portfolios }` |
| `GET` | `/api/admin/portfolios` | `X-Admin-Key` | — | `{ portfolios: CustomPortfolio[] }` (all user & global portfolios) |
| `PATCH` | `/api/admin/portfolios/:id` | `X-Admin-Key` | `{ isGlobal?: boolean, name?: string, defaultBudget?: number }` | `{ ok: true, portfolio: CustomPortfolio }` |
| `DELETE` | `/api/admin/portfolios/:id` | `X-Admin-Key` | — | `{ ok: true }` |
| `GET` | `/api/admin/export/runs.csv` | `X-Admin-Key` | — | `text/csv` attachment of all rows in `runs` |
| `GET` | `/api/admin/export/users.csv` | `X-Admin-Key` | — | `text/csv` attachment of all rows in `users` |
| `GET` | `/api/admin/export/portfolios.csv` | `X-Admin-Key` | — | `text/csv` attachment of all metadata rows in `custom_portfolios` |
| `GET` | `/api/admin/backup` | `X-Admin-Key` | — | `application/octet-stream` binary SQLite backup via `db.backup(tmpFile)` |

#### `POST /api/runs` Request Payload Schema (Zod-validated)

```json
{
  "playerName": "Jane Doe",
  "runName": "Portfolio 20-11-2026",
  "preset": "standard",
  "config": {
    "fundingProfile": "scurve",
    "fundingFrequency": 3,
    "budgetTightness": 1.5,
    "customTotalBudget": null,
    "customPortfolioId": null,
    "customPortfolioName": null,
    "politicalProjects": 2,
    "concurrentCap": 0,
    "approvalLag": 0,
    "riskMultiplier": 1.0,
    "blindAlignment": false,
    "blindScore": false,
    "preset": "standard",
    "arcEnabled": true,
    "benefitsEnabled": false
  },
  "seed": 481920311,
  "score": {
    "final": 78.4,
    "band": "Good",
    "delivery": 32.0,
    "alignment": 26.8,
    "efficiency": 21.6,
    "benefits": 0,
    "raw": 80.4,
    "penalty": 2,
    "completed": 16,
    "abandoned": 1,
    "expired": 0,
    "arcReductions": 0,
    "insolvent": false,
    "benefitsBU": 0,
    "benefitsPotentialBU": 0
  },
  "endMonth": 61,
  "startedAt": 1753200000000,
  "endedAt": 1753200900000,
  "durationSeconds": 900
}
```

---

## 4. Complete Client Data Structures

### 4.1 Simulation State (`sim`)

```typescript
interface SimState {
  name: string;                    // e.g. "Portfolio 20-11-2026"
  playerName: string;              // From verified auth.name or "Anonymous"
  seed: number;                    // 32-bit random seed for deterministic replay/rolls
  month: number;                   // Current simulation month: 1..60 (becomes 61 at normal end)
  annualRate: number;              // Annual inflation rate as decimal (e.g. 0.03 for 3%)
  monthlyRate: number;             // Derived: Math.pow(1 + annualRate, 1 / 12) - 1
  totalBudget: number;             // Explicit customTotalBudget ($M) if provided, else (sum of all bacInitial) / budgetTightness ($M)
  releaseSchedule: number[];       // Pre-computed array of N = Math.round(60 / fundingFrequency) tranches
  quarterlyRelease: number;        // Current tranche release amount (kept for display compatibility)
  released: number;                // Cumulative funds released to date ($M)
  availableBalance: number;        // Unspent cash currently available ($M)
  maxComp: number;                 // Greedy cheapest-first max possible completions within totalBudget across sim.projects
  projects: Project[];             // Array of N projects (30 by default; 1..50 for custom imported portfolios, IDs P01..P50)
  events: RiskEvent[];             // All historical risk events triggered across the run
  decisions: Decision[];           // Audit log of all user actions
  alerts: RiskEvent[];             // Current-month undismissed risk event alerts
  history: MonthHistory[];         // Recorded at end of each month m
  status: "running" | "ended";
  startedAt: number;               // Epoch ms when run started
  endedAt?: number;                // Epoch ms when run finalized
  durationSeconds?: number | null; // Math.round((endedAt - startedAt) / 1000)
  insolvent?: boolean;             // True if terminated early via shortfall insolvency
  endMonth?: number;               // sim.month at finalization
  config: SimConfig;
  score?: ScoreResult;             // Populated upon finalize()
}
```

### 4.2 Simulation Configuration (`sim.config`)

```typescript
interface SimConfig {
  preset: "learning" | "standard" | "advanced" | "custom";
  fundingProfile: "flat" | "scurve" | "frontloaded" | "backloaded" | "volatile";
  fundingFrequency: 1 | 3 | 6 | 12;          // Months between releases (1=Monthly, 3=Quarterly, 6=Bi-annual, 12=Annual)
  budgetTightness: 1.2 | 1.5 | 1.8 | 2.2;    // Scarcity divisor on total initial BAC (used when customTotalBudget is null)
  customTotalBudget?: number | null;         // User-defined explicit total budget ($M) in Custom mode; overrides budgetTightness when > 0
  customPortfolioId?: string | null;         // ID of the selected custom/global portfolio (null for procedural 30-project pool)
  customPortfolioName?: string | null;       // Display name of the selected custom/global portfolio
  politicalProjects: number;                 // 0..5 mandatory projects forced at Month 1
  concurrentCap: 0 | 5 | 8 | 12;             // Max simultaneous Active + Pending projects (0 = unconstrained)
  approvalLag: 0 | 2 | 4 | 6;                // Months a newly added project stays in "pending" state
  riskMultiplier: 0.5 | 1.0 | 1.5;           // Scales base cost/duration risk factors (capped at 0.40)
  blindAlignment: boolean;                   // Hides strategic alignment badges/sorting during the run
  blindScore: boolean;                       // Hides live projected score during the run
  arcEnabled: boolean;                       // Enables Integrated Budget Wallet (Annual Recurring Cost)
  benefitsEnabled: boolean;                  // Enables Social Benefits (Benefit Units & 15-pt scoring weight)
}
```

### 4.3 Project Object (`sim.projects[i]`)

```typescript
type ProjectState =
  | "available"
  | "pending"
  | "active"
  | "suspended"
  | "completed"
  | "abandoned"
  | "expired";

interface Project {
  id: string;                      // "P01" through "P50"
  title: string;                   // Modifier + subcategory noun phrase (or custom imported title)
  category: string;                // One of 3 public-sector categories
  subCategory: string;             // One of 12 public-sector subcategories
  arcRate: number;                 // Annual Recurring Cost rate as fraction of BAC (0.00 to 1.00; standard 0.015 to 0.49)
  bacInitial: number;              // Initial uninflated budget ($2.00M to $15.00M procedural; $0.10M to $500.00M custom)
  bacCurrent: number;              // 0 while available; locked at inflated BAC when added; modified by crash premiums & cost risk shocks
  alignment: number;               // Strategic alignment fraction (0.00 to 1.00)
  durationPlanned: number;         // Planned baseline duration in months (12 to 36 procedural; 1 to 60 custom)
  durationCurrent: number | null;  // Current total duration after rebaselines
  costRiskBase?: number;           // Unscaled base costRisk (0.00..0.40) preserved for accurate Excel re-export
  durRiskBase?: number;            // Unscaled base durRisk (0.00..0.40) preserved for accurate Excel re-export
  costRisk: number;                // Base * riskMultiplier, capped at 0.40
  durRisk: number;                 // Base * riskMultiplier, capped at 0.40
  state: ProjectState;
  startMonth: number | null;       // Month project entered "active" state
  completionMonth: number | null;  // Month project completed
  pendingUntil?: number | null;    // Month when pending approval lag expires
  nominalSpent: number;            // Cumulative uninflated S-curve spend consumed so far
  cashDrawn: number;               // Cumulative inflation-adjusted cash drawn from availableBalance
  sCurve: number[];                // Remaining forward monthly nominal spend array (shifted each active month)
  sCurveBaseline: number[];        // Snapshot of initial S-curve at activation (for S-Curve tab comparison)
  drawHistory?: { m: number; nom: number }[]; // Actual nominal draws by month for S-Curve actuals plot
  milestones: number[];            // Triggered risk thresholds: subset of [25, 50, 75]
  suspendPenalty: number;          // Cumulative penalty months added from resumptions
  political?: boolean;             // True if forced active at Month 1 (or flagged in custom import)
  lockUntil?: number | null;       // 24 for political projects (cannot abandon when sim.month <= 24)
  arcBaseBac: number;              // bacCurrent frozen at completionMonth (base for ARC calculations)
  arcReduced: boolean;             // True while ARC funding is currently cut by 30%
  arcBacklog: number;              // Accumulated withheld 30% ARC owed to restore full funding ($M)
  arcReductionCount: number;       // Lifetime times ARC was reduced on this project (max 2)
  arcCutoff: boolean;              // True if completed project was abandoned via full ARC cutoff
  buRate: number;                  // Benefit Units generated per month once completed & fully funded
  buCumulative: number;            // Running total Benefit Units accrued (can go negative under arcCutoff)
}
```

### 4.4 Supporting Objects (`RiskEvent`, `Decision`, `MonthHistory`, `ScoreResult`, `CustomPortfolio`)

```typescript
interface RiskEvent {
  month: number;
  id: string;                      // Project ID
  title: string;
  milestone: 25 | 50 | 75;
  costDelta: number;               // e.g. +0.12 or -0.12 (0 if unchanged)
  durDelta: number;                // e.g. +0.15 or -0.15 (0 if unchanged)
  newBac: number;
  newEnd: number;                  // startMonth + durationCurrent
}

interface Decision {
  month: number;
  type: "add" | "slow" | "speed" | "suspend" | "resume" | "abandon" | "arc_reduce" | "arc_restore" | "arc_cutoff";
  id: string;
  title: string;
  s?: number;                      // Slowdown fraction (0.05..0.80) for "slow"
  a?: number;                      // Compression fraction (0.05..0.60) for "speed"
}

interface MonthHistory {
  month: number;
  demand: number;                  // Capital demand spent in month ($M)
  arc: number;                     // ARC spent in month ($M)
  balanceAfter: number;            // Available balance at end of month before next month's release ($M)
}

interface ScoreResult {
  delivery: number;
  alignment: number;
  efficiency: number;
  benefits: number;
  raw: number;
  penalty: number;
  final: number;
  band: "Excellent" | "Good" | "Satisfactory" | "Poor" | "Needs Development";
  wasted: number;                  // (sunk + unspent) / totalBudget clamped to 0..1
  deliveryMax: 35 | 40;
  alignmentMax: 30 | 35;
  efficiencyMax: 20 | 25;
  completed: number;
  abandoned: number;
  expired: number;
  arcReductions: number;
  insolvent: boolean;
  insolvencyPenalty: 0 | 10;
  benefitsOn: boolean;
  benefitsBU: number;
  benefitsPotentialBU: number;
}

interface CustomPortfolio {
  id: string;
  ownerEmail: string;
  ownerName: string | null;
  name: string;
  description: string | null;
  projectCount: number;
  totalBac: number;
  defaultBudget: number;
  projects: ProjectTemplate[];
  isGlobal: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 5. Simulation Engine & Mathematical Logic

### 5.1 Seeded PRNG & Deterministic Call Order

All random generation uses a deterministic 31-bit Linear Congruential Generator:

```javascript
function mkRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
```

- At simulation creation (`newSim`), `seed = Math.floor(Math.random() * 1e9)`.
- **Exact PRNG Consumption Order in `newSim(cfg)`:**
  1. `assignCategories(rng)`: Repeatedly Fisher-Yates shuffles `ARC_CATEGORIES` (12 items) into `slots` until `slots.length >= 30`, then returns `shuffle(slots.slice(0, 30), rng)`.
  2. For each of the 30 projects `i = 0..29` in `genProjects(rng)`:
     - Picks `TITLE_A[Math.floor(rng() * TITLE_A.length)]` and `words[Math.floor(rng() * words.length)]` in a `do...while` loop until deduplicated.
     - Computes `bacInitial = +(2 + rng() * 13).toFixed(2)`
     - Computes `alignment = +(0.20 + rng() * 0.80).toFixed(2)`
     - Computes `durationPlanned = 12 + Math.floor(rng() * 25)`
     - Computes `costRiskBase = +(0.05 + rng() * 0.15).toFixed(3)`
     - Computes `durRiskBase = +(0.05 + rng() * 0.15).toFixed(3)`
  3. Next, `computeReleaseSchedule(totalBudget, fundingProfile, rng, N)` consumes `N` calls from `rng` if and only if `fundingProfile === "volatile"`.
- At each monthly advance (`doAdvance`), the month's risk rolls use an isolated deterministic sub-seed:
  `const rng = mkRng((sim.seed + sim.month * 2654435761) >>> 0);`

### 5.2 Categories, Subcategories, ARC Rates, BU Intensities & Titles

Procedural pools distribute 30 projects evenly across **12 subcategories**. Custom imported portfolios may contain **1 to 50 projects** mapped to any combination of these 12 subcategories.

| Category | Subcategory | `arcRate` (Annual) | `BU_INTENSITY` (BU / $1M BAC / mo) | Title Noun Phrases (`CATEGORY_TITLE_WORDS`) |
|---|---|---|---|---|
| **Physical Infrastructure & Transport** | Paved Roads & Highways | `0.0500` (5.00%) | `0.8` | `"Highway Corridor"`, `"Paved Road Network"`, `"Arterial Road Upgrade"` |
| **Physical Infrastructure & Transport** | Feeder & Rural Roads | `0.1000` (10.00%) | `1.0` | `"Feeder Road Programme"`, `"Rural Access Roads"`, `"Farm-to-Market Road Link"` |
| **Physical Infrastructure & Transport** | Buildings (Administrative) | `0.0200` (2.00%) | `0.3` | `"Administrative Complex"`, `"Government Office Building"`, `"Civic Centre"` |
| **Physical Infrastructure & Transport** | Large-Scale Dams & Reservoirs | `0.0150` (1.50%) | `0.6` | `"Dam & Reservoir Scheme"`, `"Multipurpose Dam Project"`, `"Water Storage Reservoir"` |
| **Social Sectors (Education & Health)** | Primary & Secondary Schools | `0.1950` (19.50%) | `1.6` | `"Schools Rehabilitation Programme"`, `"Primary Schools Expansion"`, `"Secondary Education Campus"` |
| **Social Sectors (Education & Health)** | Polytechnic & Technical Schools | `0.2100` (21.00%) | `1.4` | `"Polytechnic Institute"`, `"Technical Training College"`, `"Vocational Skills Campus"` |
| **Social Sectors (Education & Health)** | General & Tertiary Hospitals | `0.2700` (27.00%) | `2.0` | `"General Hospital"`, `"Tertiary Care Hospital"`, `"Medical Centre Upgrade"` |
| **Social Sectors (Education & Health)** | Rural Health Centers | `0.4900` (49.00%) | `1.8` | `"Rural Health Centre Network"`, `"Basic Health Unit Programme"`, `"Community Clinic Scheme"` |
| **Agriculture, Irrigation & Resources** | Irrigation & Drainage Systems | `0.0300` (3.00%) | `1.1` | `"Irrigation & Drainage Scheme"`, `"Canal Irrigation Upgrade"`, `"Drainage Improvement Project"` |
| **Agriculture, Irrigation & Resources** | Agricultural Research & Extension | `0.0475` (4.75%) | `0.9` | `"Agricultural Research Station"`, `"Extension Services Programme"`, `"Crop Research Centre"` |
| **Agriculture, Irrigation & Resources** | Livestock & Veterinary Services | `0.1050` (10.50%) | `0.9` | `"Livestock Development Programme"`, `"Veterinary Services Centre"`, `"Animal Health Station"` |
| **Agriculture, Irrigation & Resources** | Forestry & Watershed Development | `0.0250` (2.50%) | `0.7` | `"Forestry & Watershed Programme"`, `"Afforestation Scheme"`, `"Watershed Management Project"` |

- **Title Modifiers (`TITLE_A`):** `["Digital", "Integrated", "Provincial", "Regional", "Smart", "Unified", "Rural", "Urban", "National", "Coastal", "Metro", "Strategic"]`
- **Attribute Initialization & Scaling (per project):**
  - `costRisk = Math.min(0.40, +(costRiskBase * riskMultiplier).toFixed(3))`
  - `durRisk = Math.min(0.40, +(durRiskBase * riskMultiplier).toFixed(3))`
  - `buRate`: If explicitly supplied in a custom portfolio import (`> 0`), uses the imported `buRate`; otherwise computed as:
    $$\text{buRate} = \text{round}_2\left(\text{bacInitial} \times \text{BU\_INTENSITY}[\text{subCategory}] \times (1 + \text{costRisk} + \text{durRisk})\right)$$
  - Display social value conversion constant: `BU_VALUE = 0.02` ($0.02M per BU, display-only).

### 5.3 Difficulty Presets

| Preset | `annualRate` | `fundingProfile` | `budgetTightness` | `politicalProjects` | `concurrentCap` | `approvalLag` | `riskMultiplier` | `blindAlignment` | `blindScore` | `arcEnabled` | `benefitsEnabled` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Learning** | `0.02` (2%) | `"flat"` | `1.2` | `0` | `0` | `0` | `0.5` | `false` | `false` | `false` (**Locked**) | `false` (Togglable) |
| **Standard** | `0.03` (3%) | `"scurve"` | `1.5` | `2` | `0` | `0` | `1.0` | `false` | `false` | `true` (Togglable) | `false` (Togglable) |
| **Advanced** | `0.05` (5%) | `"volatile"` | `1.8` | `4` | `8` | `2` | `1.5` | `false` | `true` | `true` (**Locked**) | `true` (**Locked**) |
| **Custom** | User-set | User-set | User-set / Explicit `$M` | User-set | User-set | User-set | User-set | User-set | User-set | Togglable | Togglable |

### 5.4 Total Budget, Max Completions, Political Projects & Release Schedule

- **Total Budget (`sim.totalBudget`):**
  - If `cfg.customTotalBudget != null && cfg.customTotalBudget > 0`:
    $$\text{totalBudget} = \text{round}_2(\text{cfg.customTotalBudget})$$
  - Otherwise:
    $$\text{totalBudget} = \text{round}_2\left(\frac{\sum_{i=1}^{M} \text{bacInitial}_i}{\text{budgetTightness}}\right)$$
    where $M = \text{projects.length}$ ($30$ procedural, or $1 \dots 50$ custom).
- **Max Possible Completions (`maxComp`):**
  Sort all $M$ projects by `bacInitial` ascending and greedily count how many fit cumulatively within `totalBudget` (minimum `1` for division safety).
- **Political Projects Forced at Month 1:**
  - In a **Custom Imported Portfolio**: Any project explicitly marked with `political = true` in the Excel import starts immediately in `"active"` state at Month 1 (bypassing `approvalLag`), locking `bacCurrent = +p.bacInitial.toFixed(4)`, `sCurve = generateSCurve(bacCurrent, p.durationPlanned)`, `sCurveBaseline = p.sCurve.slice()`, `startMonth = 1`, `durationCurrent = p.durationPlanned`, `political = true`, and `lockUntil = 24`. If the count of pre-flagged political projects is less than `cfg.politicalProjects`, additional projects are picked from the remaining pool sorted by `alignment` ascending until `cfg.politicalProjects` is reached.
  - In a **Procedural 30-Project Pool**: All 30 projects are sorted by `alignment` ascending (`[...projects].sort((a, b) => a.alignment - b.alignment)`), and the first `politicalProjects` ($0 \dots 5$) are forced active at Month 1 with `bacCurrent = p.bacInitial`, `startMonth = 1`, `political = true`, and `lockUntil = 24` (bypassing `approvalLag`).
- **Release Schedule (`computeReleaseSchedule(totalBudget, profile, rng, N)` where $N = \text{round}(60 / \text{fundingFrequency})$):**
  - `flat`: Array of $N$ elements each equal to `+(totalBudget / N).toFixed(4)`
  - `scurve`: Weights $w_i = \text{betaCDF}((i+1)/N) - \text{betaCDF}(i/N)$ for $i = 0 \dots N-1$, normalized so $\sum = \text{totalBudget}$
  - `frontloaded`: Weights $w_i = N - i$, normalized to `totalBudget`
  - `backloaded`: Weights $w_i = i + 1$, normalized to `totalBudget`
  - `volatile`: Weights $w_i = 0.8 + \text{rng}() \times 0.4$, normalized to `totalBudget`
- **Release Timing:** Tranche index `qi = Math.floor((month - 1) / fundingFrequency)` is released at simulation start (`month = 1`, `qi = 0`) and whenever `(sim.month - 1) % fundingFrequency === 0` upon rolling into `sim.month <= 60`. Unused funds carry forward indefinitely.

### 5.5 Beta(2,2) S-Curve & Rebaselining

- **Regularized Incomplete Beta Function ($\alpha=2, \beta=2$):**
  $$\text{betaCDF}(x) = 3x^2 - 2x^3$$
- **S-Curve Generation (`generateSCurve(budget, duration)`):**
  For $d = \max(1, \text{round}(\text{duration}))$ and $t = 1 \dots d$:
  $$\text{spend}[t-1] = \text{budget} \times \left(\text{betaCDF}\left(\frac{t}{d}\right) - \text{betaCDF}\left(\frac{t-1}{d}\right)\right)$$
- **Rebaseline Routine (`rebaseline(p, newRemainingMonths, atMonth)`):**
  ```javascript
  const remBudget = Math.max(0, p.bacCurrent - p.nominalSpent);
  p.sCurve = generateSCurve(remBudget, newRemainingMonths);
  const elapsed = atMonth - p.startMonth;
  p.durationCurrent = elapsed + p.sCurve.length;
  ```

### 5.6 Inflation Compounding

- **Monthly Inflation Rate:**
  $$\text{monthlyRate} = (1 + \text{annualRate})^{1/12} - 1$$
- **Monthly Inflator at Global Month $m$:**
  $$\text{inflator}(\text{monthlyRate}, m) = (1 + \text{monthlyRate})^m$$
- **Effect on Available Pool:** While a project is in `"available"` state at month $m$, its displayed and lock-in BAC is:
  $$\text{bacShown}(m) = \text{bacInitial} \times (1 + \text{monthlyRate})^m$$
- **Effect on Suspended Projects (Displayed Inflating Remaining Cost):** While a project is in `"suspended"` state at month $m$, its remaining unspent nominal budget is `remNominal = Math.max(0, p.bacCurrent - p.nominalSpent)`, and its displayed current inflation-adjusted remaining cost on `SuspendedRow` is:
  $$\text{remInflated}(m) = (\text{bacCurrent} - \text{nominalSpent}) \times (1 + \text{monthlyRate})^m$$
- **Effect on Active Capital Demand:** In month $m$, an active project's nominal spend `p.sCurve[0]` draws inflation-adjusted cash:
  $$\text{cashDemand}(p, m) = \text{p.sCurve}[0] \times (1 + \text{monthlyRate})^m$$

### 5.7 Project Lifecycle Mutations & Same-Month Undo

1. **Same-Month Undo Snapshot (`monthStartSnapshot`):**
   - At the start of Month 1 and immediately after each monthly advance (`doAdvance`), the application stores a clean deep clone of `sim` in `monthStartSnapshot` (or maintains an array of decision snapshots within the current month `undoStack`).
   - Any mutation during Month $m$ (`add`, `slow`, `speed`, `suspend`, `resume`, `abandon`, `arc_reduce`, `arc_restore`, `arc_cutoff`) pushes the pre-mutation state onto `undoStack`.
   - Clicking **↩ Undo** pops the last snapshot from `undoStack` and restores `sim`. Advancing to Month $m+1$ clears `undoStack`.

2. **Add Project (`addProject(sim, id)`):**
   - Guards: `p.state === "available"`, and if `concurrentCap > 0`, count of `active + pending` projects must be `< concurrentCap`.
   - Locks `p.bacCurrent = +(p.bacInitial * inflator(sim.monthlyRate, sim.month)).toFixed(4)`.
   - If `approvalLag > 0`:
     - `p.state = "pending"`, `p.pendingUntil = sim.month + approvalLag`, `p.startMonth = null`, `p.sCurve = []`.
   - Else (`approvalLag === 0`):
     - `p.sCurve = generateSCurve(p.bacCurrent, p.durationPlanned)`
     - `p.sCurveBaseline = p.sCurve.slice()`
     - `p.state = "active"`, `p.startMonth = sim.month`, `p.durationCurrent = p.durationPlanned`.
   - Logs decision `{ month: sim.month, type: "add", id, title: p.title }`.

3. **Slow Down (`slowProject(sim, id, s)`):**
   - Guard: `p.state === "active"` and $0 < s < 1$ (slider: 5% to 80%, step 5%; shortfall quick-action: $s = 0.30$).
   - `rebaseline(p, Math.ceil(p.sCurve.length / (1 - s)), sim.month)`.
   - Logs decision `{ month: sim.month, type: "slow", id, title: p.title, s }`.

4. **Speed Up / Schedule Crashing (`speedProject(sim, id, a)`):**
   - Guard: `p.state === "active"` and $0 < a < 1$ (slider: 5% to 60%, step 5%).
   - Crash cost constant: `CRASH_K = 0.5`.
   - `remBudget = Math.max(0, p.bacCurrent - p.nominalSpent)`
   - `premium = remBudget * CRASH_K * a`
   - `p.bacCurrent = +(p.bacCurrent + premium).toFixed(4)`
   - `newRem = Math.max(1, Math.ceil(p.sCurve.length * (1 - a)))`
   - `rebaseline(p, newRem, sim.month)`
   - Logs decision `{ month: sim.month, type: "speed", id, title: p.title, a }`.

5. **Suspend (`suspendProject(sim, id)`):**
   - Guard: `p.state === "active"`.
   - `p.state = "suspended"`.
   - Logs decision `{ month: sim.month, type: "suspend", id, title: p.title }`.

6. **Resume (`resumeProject(sim, id)`):**
   - Guard: `p.state === "suspended"`.
   - Adds 10% duration penalty: `p.suspendPenalty += Math.ceil(p.sCurve.length * 0.1)`.
   - `rebaseline(p, Math.ceil(p.sCurve.length * 1.1), sim.month)`.
   - `p.state = "active"`.
   - Logs decision `{ month: sim.month, type: "resume", id, title: p.title }`.

7. **Abandon (`abandonProject(sim, id)`):**
   - Guard: `p.state === "active" || p.state === "suspended"`.
   - Political lock guard: Cannot abandon if `p.political && p.lockUntil && sim.month <= p.lockUntil` (locked until after Month 24).
   - `p.state = "abandoned"`, `p.sCurve = []`.
   - Logs decision `{ month: sim.month, type: "abandon", id, title: p.title }`.

### 5.8 Post-Completion Systems: ARC & Social Benefits

1. **Annual Recurring Cost (`arcEnabled`):**
   - Starts **1 month after completion** (`month > p.completionMonth`) for projects with `p.state === "completed"`.
   - Steps up once per elapsed year after completion:
     ```javascript
     const elapsed = month - p.completionMonth; // 1, 2, 3...
     const yearIdx = Math.floor((elapsed - 1) / 12);
     const arcFull = (p.arcBaseBac * p.arcRate / 12) * Math.pow(1 + annualRate, yearIdx);
     const arcEffective = p.arcReduced ? arcFull * 0.7 : arcFull;
     ```
   - **Reduce ARC Funding (`reduceArcFunding(sim, id)`):**
     - Available in the Shortfall Resolution panel when `p.state === "completed"`, `!p.arcReduced`, and `p.arcReductionCount < 2`.
     - Sets `p.arcReduced = true`, increments `p.arcReductionCount += 1` (permanent −2 pt score penalty per reduction).
     - Each month while reduced, the unpaid 30% (`arcFull * 0.3`) accumulates into `p.arcBacklog`.
   - **Restore ARC Funding (`restoreArcFunding(sim, id)`):**
     - Available on Completed project rows when `p.arcReduced && sim.availableBalance >= p.arcBacklog`.
     - Deducts `p.arcBacklog` from `sim.availableBalance`, sets `p.arcReduced = false` and `p.arcBacklog = 0`. Does **not** decrement `p.arcReductionCount`.
   - **Full ARC Cutoff / Decommission (`cutArcCompletely(sim, id)`):**
     - Available in the Shortfall Resolution panel once a completed project has exhausted both lifetime reductions (`p.arcReductionCount >= 2`).
     - Transitions `p.state = "abandoned"`, sets `p.arcCutoff = true`, `p.arcReduced = false`, `p.arcBacklog = 0`.
     - Consequences: Project loses Delivery credit, its entire `cashDrawn` counts as sunk cost in Budget Efficiency, it incurs the −2 abandoned penalty (on top of its 2×2 = −4 ARC reduction penalties), and its Social Benefits flip permanently negative.

2. **Social Benefits (`benefitsEnabled`):**
   - Tracked for any project where `p.state === "completed" || (p.state === "abandoned" && p.arcCutoff)`.
   - Starts **1 month after completion** (`month > p.completionMonth`):
     - Normal completed (`!p.arcReduced && !p.arcCutoff`): `+p.buRate` BU/month
     - ARC-reduced (`p.arcReduced`): `+p.buRate * 0.4` BU/month (30% funding cut causes a 60% benefit loss)
     - Full ARC cutoff (`p.arcCutoff`): `-p.buRate * 1.5` BU/month (decommissioned asset generates negative social value for the rest of the run)
   - Potential BU for scoring (`benefitPotentialFor(p, uptoMonth)`):
     $$\text{potentialBU}(p) = \text{p.buRate} \times \max(0, \text{uptoMonth} - \text{p.completionMonth})$$

### 5.9 Monthly Advance Sequence (`deductAndProgress(sim, rng)`)

When the user clicks **Advance** at month $m$:
1. **Shortfall Gate (`tryAdvance`):**
   - Computes `totalDemandAt(sim, m) = demandAt(sim, m) + (arcEnabled ? arcDemandAt(sim, m) : 0)`.
   - If `totalDemand > sim.availableBalance + 1e-6`, opens the blocking **Shortfall Resolution Panel** instead of advancing.
2. **Activate Pending Projects:**
   - Any project with `p.state === "pending" && m >= p.pendingUntil` transitions to `"active"` with `p.startMonth = m`, `p.sCurve = generateSCurve(p.bacCurrent, p.durationPlanned)`, `p.sCurveBaseline = p.sCurve.slice()`, `p.durationCurrent = p.durationPlanned`.
3. **Deduct Capital Demand:**
   - `capexDemand = demandAt(sim, m)`
   - `sim.availableBalance -= capexDemand`
   - Clears `sim.alerts = []`.
4. **Progress Active Projects & Evaluate Risk Milestones:**
   - For each active project `p`:
     - `nom = p.sCurve.shift() || 0`
     - Appends `{ m, nom }` to `p.drawHistory`.
     - `p.nominalSpent += nom`
     - `p.cashDrawn += nom * inflator(sim.monthlyRate, m)`
     - Computes spend progress `prog = p.bacCurrent ? p.nominalSpent / p.bacCurrent : 1`.
     - For each threshold `mEdge` in `[0.25, 0.5, 0.75]` (`key = mEdge * 100`):
       - If `prog >= mEdge && !p.milestones.includes(key)`:
         - Marks `p.milestones.push(key)`.
         - **Cost Risk Roll:** If `rng() < p.costRisk`, picks `sign = rng() < 0.5 ? 1 : -1`, `costDelta = sign * p.costRisk`, updates `p.bacCurrent = +(p.bacCurrent * (1 + costDelta)).toFixed(4)`.
         - **Duration Risk Roll:** If `rng() < p.durRisk`, picks `sign = rng() < 0.5 ? 1 : -1`, `durDelta = sign * p.durRisk`, `rem = Math.max(1, Math.round(p.sCurve.length * (1 + durDelta)))`, calls `rebaseline(p, rem, m)`.
         - Else if `costDelta !== 0`, calls `rebaseline(p, Math.max(1, p.sCurve.length), m)`.
         - If `costDelta || durDelta`, pushes event object to `sim.events` and `sim.alerts`.
     - **Completion Check:** If `p.sCurve.length === 0 && p.state === "active"`, sets `p.state = "completed"`, `p.completionMonth = m`, `p.arcBaseBac = p.bacCurrent`.
5. **Deduct ARC & Accrue Backlog:**
   - If `arcEnabled`, sums ARC across all `p.state === "completed"` projects (adding withheld 30% to `p.arcBacklog` for reduced projects) and deducts `arcAmount` from `sim.availableBalance`.
6. **Accrue Social Benefits:**
   - If `benefitsEnabled`, adds `benefitMonthlyFor(p, m)` to `p.buCumulative` for all benefit-tracked projects.
7. **Record History & Roll Month Forward:**
   - Pushes `{ month: m, demand: +capexDemand.toFixed(3), arc: +arcAmount.toFixed(3), balanceAfter: +sim.availableBalance.toFixed(3) }` to `sim.history`.
   - `sim.month = m + 1`.
   - If `sim.month <= 60`:
     - Checks if `(sim.month - 1) % fundingFrequency === 0`. If true, adds `release = sim.releaseSchedule[qi]` to `sim.availableBalance` and `sim.released`, updates `sim.quarterlyRelease = release`.
   - Else (`sim.month > 60`):
     - Calls `finalize(sim)`: marks any remaining `active`, `suspended`, or `pending` projects as `"expired"`, sets `sim.status = "ended"`, timestamps `endedAt` and `durationSeconds`, and computes `sim.score = scoreSim(sim)`.

### 5.10 Unified Funding Analysis Engine (`computeFundingAnalysis(sim, granularity)`)

Used by the **Cash Flow** tab, **Funds** tab, **Project Preview Modal**, and the **Cash Flow red crunch-warning dot**:
- Builds a 60-month base series combining actual historical spend/ARC for `m < sim.month` with forward S-curve + projected ARC (including future completions of currently active projects) for `m >= sim.month`, and scheduled releases at `(m - 1) % fundingFrequency === 0`.
- Buckets the 60 months into periods according to `granularity`:
  - `"M"` (Monthly): span = 1, 60 buckets (`M1..M60`)
  - `"Q"` (Quarterly): span = 3, 20 buckets (`Q1..Q20`)
  - `"Y"` (Yearly): span = 12, 5 buckets (`Y1..Y5`)
- Computes cumulative series (`cumulativeSpend`, `cumulativeArc`, `cumulativeRequirement`, `cumulativeFunding`) and net headroom:
  $$\text{net}[i] = \text{cumulativeFunding}[i] - \text{cumulativeRequirement}[i]$$
- Flags a bucket `i` as **overloaded** when `net[i] < -eps` (where `eps = 1e-6 * Math.max(1, totalRequirement)`), and merges contiguous overloaded buckets into `overloadedRanges` (`{ fromIdx, toIdx, fromLabel, toLabel, worst }`).

---

## 6. Excel Export, Custom Portfolio Import & Global Sharing System

### 6.1 Standardized 12-Column Excel Schema (`Projects_Baseline` Sheet)

The application uses SheetJS (`xlsx`) to export and import `.xlsx` files. The first worksheet (`Projects_Baseline`) has 12 columns that round-trip seamlessly between Export and Import:

| Column Header | Property | Format / Type | Import Validation & Defaulting Rules |
|---|---|---|---|
| `Project ID` | `id` | String (`"P01".."P50"`) | Optional. Auto-normalized to `"P01".."P50"` by row index if blank or duplicated. |
| `Title` | `title` | String (`1–100` chars) | **Required.** Trimmed; if blank, auto-generates `"Project PXX"` and flags a warning in preview. |
| `Category` | `category` | String | Auto-inferred from `Subcategory` via `ARC_CATEGORIES` lookup so users never have to worry about category/subcategory mismatch. |
| `Subcategory` | `subCategory` | String (1 of 12) | Matched case-insensitively (and by partial keyword) against the 12 canonical `ARC_CATEGORIES` subcategories. If unrecognized, defaults to `"Buildings (Administrative)"` and highlights cell in amber for inline dropdown correction. |
| `Initial Budget ($M)` | `bacInitial` | Number (`0.10` to `500.00`) | **Required.** Stripped of `$` / `M` symbols if pasted as text; clamped to `[0.10, 500.00]`. |
| `Planned Duration (Months)` | `durationPlanned` | Integer (`1` to `60`) | **Required.** Rounded to integer, clamped to `[1, 60]`. |
| `Strategic Alignment (%)` | `alignment` | Number (`0` to `100` or `0.00` to `1.00`) | **Required.** If value `> 1`, divided by `100`; clamped to `[0.01, 1.00]`. Exported as percentage number `0..100` (e.g. `78`). |
| `Cost Risk (%)` | `costRiskBase` | Number (`0` to `40` or `0.00` to `0.40`) | Base cost risk before `riskMultiplier`. If `> 1`, divided by `100`; clamped to `[0.00, 0.40]`. Defaults to `10%` (`0.10`) if blank. |
| `Duration Risk (%)` | `durRiskBase` | Number (`0` to `40` or `0.00` to `0.40`) | Base duration risk before `riskMultiplier`. If `> 1`, divided by `100`; clamped to `[0.00, 0.40]`. Defaults to `10%` (`0.10`) if blank. |
| `ARC Rate (%)` | `arcRate` | Number (`0` to `100` or `0.00` to `1.00`) | Optional. If blank, defaults to the canonical `arcRate` for `Subcategory`. If provided (`> 1` divided by `100`), overrides the canonical rate. |
| `Benefit Rate (BU/mo)` | `buRate` | Number (`>= 0`) | Optional. If blank or `0`, auto-computed from `bacInitial`, `BU_INTENSITY[subCategory]`, and risk factors. |
| `Political Mandatory` | `political` | Boolean (`TRUE`/`FALSE`, `Yes`/`No`, `1`/`0`) | Optional. Defaults to `FALSE`. If `TRUE`, project starts Active at Month 1 (locked until M24). |

### 6.2 Multi-Sheet Export Workbook Structure

1. **Exporting from Setup Screen (`Download Sample Template (.xlsx)`):**
   - Generates a 30-project `.xlsx` file (`portfolio-template.xlsx`) containing the `Projects_Baseline` sheet with 30 realistic projects across all 12 subcategories.
2. **Exporting Mid-Run (from Header Overflow Menu `⋯ → Export projects (.xlsx)` or `Add projects` header button) & Post-Run (from Debrief `Export (.xlsx)` button):**
   - Generates `<run-name>-export.xlsx` with **4 worksheets**:
     1. **`Projects_Baseline`**: The exact 12-column schema above using each project's initial baseline attributes (`costRiskBase`, `durRiskBase`, `bacInitial`, etc.). **This file can be directly re-imported into Custom mode to replay or share the exact same project pool.**
     2. **`Run_Outcomes`**: All projects with their live/final run state (`State`, `Start Month`, `Completion Month`, `Initial BAC ($M)`, `Locked/Current BAC ($M)`, `Nominal Spent ($M)`, `Real Cash Drawn ($M)`, `Planned Duration`, `Final Duration`, `Milestones Triggered`, `ARC Reduced`, `ARC Reductions Count`, `ARC Backlog ($M)`, `Cumulative Benefits (BU)`).
     3. **`Monthly_Cash_Flow`**: All recorded months (`Month`, `Funding Release ($M)`, `Capex Demand ($M)`, `ARC Spent ($M)`, `Total Requirement ($M)`, `Ending Available Balance ($M)`).
     4. **`Decisions_Log`**: Complete chronological decision history (`Month`, `Action Type`, `Project ID`, `Project Title`, `Parameter %`).

### 6.3 Custom Portfolio Import & Inline Validation Modal (`PortfolioImportModal`)

Accessible in the Setup Screen when `preset === "custom"` via the **Import Excel (.xlsx)** button:
1. **File Dropzone & Template Download:**
   - Accepts `.xlsx`, `.xls`, and `.csv` files.
   - Enforces **1 to 50 projects** (`rows.length > 50` trims to 50 with a clear notice; `rows.length === 0` shows an error).
2. **Portfolio Metadata Inputs:**
   - **Portfolio Name:** Text input (required, defaults to filename without extension, e.g., `"Provincial Infrastructure Plan 2027"`).
   - **Default Total Available Budget ($M):** Numeric input (required, defaults to `+(sumBacInitial / 1.5).toFixed(2)`, showing live helper text: `"Sum of project BACs: $X.XXM · Max possible completions: Y of N"`).
3. **Interactive Inline Preview & Editor Table:**
   - Displays all imported rows ($1 \dots 50$) in a scrollable table.
   - Users can edit any cell inline before saving:
     - `Title` (text input)
     - `Subcategory` (`<select>` dropdown of the 12 canonical subcategories; changing it auto-updates `Category` and default `ARC Rate`)
     - `Initial Budget ($M)`, `Duration (mo)`, `Alignment (%)`, `Cost Risk (%)`, `Dur Risk (%)`, `ARC Rate (%)`, `Political` (checkbox)
   - Cells that triggered an automatic fallback during import are highlighted with an amber border so the user can review them at a glance.
   - Users can also click `+ Add Row` (up to 50) or `🗑` to remove a row.
4. **Save to Account:**
   - Clicking **Save Portfolio & Select** sends `POST /api/portfolios` with `{ name, defaultBudget, projects }` (and also caches to `localStorage["portfolio_sim_custom_portfolios_v1"]` as an offline fallback).
   - Automatically selects the newly saved portfolio in the Setup Screen and populates the **Total Available Budget ($M)** input with `defaultBudget`.

### 6.4 Saved User Portfolios & Global Portfolios Workflow

1. **Association with User Account:**
   - Every saved custom portfolio is stored in `custom_portfolios` with `owner_email = req.user.email`.
   - Whenever the user logs in on any device, `GET /api/portfolios` returns:
     - **My Portfolios (`owner_email === user.email`):** Editable and deletable by the user.
     - **Global Portfolios (`is_global === 1`):** Promoted by the administrator; available to all registered users in Custom mode.
2. **Selecting a Portfolio & Setting Total Budget in Custom Mode:**
   - In the Setup Screen's Custom configuration section, a **"Project Pool & Total Budget"** card allows choosing:
     - `🎲 Procedural Pool (30 random projects)`
     - Any saved portfolio from `👤 My Portfolios` or `🌐 Global Portfolios` (shows project count, total BAC, and a `🗑` delete button for user-owned portfolios).
   - Next to the selector is the **"Total Available Budget ($M)"** control:
     - When using a saved/imported portfolio, defaults to that portfolio's `defaultBudget`, but the user can freely type any dollar amount (e.g., `$120.00M`) or use quick-ratio pills (`80% of BAC`, `67% (Standard)`, `55% (Tight)`).
     - Even with the procedural 30-project pool in Custom mode, the user can optionally toggle between **Tightness Divisor (`1.2×–2.2×`)** or an **Explicit Dollar Budget ($M)**.

---

## 7. Scoring, Benchmarking & Rule-Based Coaching Engines

### 7.1 Composite Score (`scoreSim(sim)`)

| Component | Max Points (`benefitsEnabled = false`) | Max Points (`benefitsEnabled = true`) | Formula |
|---|---|---|---|
| **Delivery** | `40` | `35` | $\min\left(1, \frac{\text{completed.length}}{\max(1, \text{sim.maxComp})}\right) \times \text{deliveryMax}$ |
| **Strategic Alignment** | `35` | `30` | $\left(\frac{1}{\text{completed.length}}\sum_{p \in \text{completed}} p.\text{alignment}\right) \times \text{alignmentMax}$ (0 if none completed) |
| **Budget Efficiency** | `25` | `20` | $(1 - \text{wasted}) \times \text{efficiencyMax}$, where $\text{wasted} = \text{clamp}\left(\frac{\sum_{p \in \text{abandoned}} p.\text{cashDrawn} + \max(0, \text{availableBalance})}{\text{totalBudget}}, 0, 1\right)$ |
| **Social Benefits** | `0` | `15` | $\text{clamp}\left(\frac{\sum \text{buCumulative}}{\sum \text{potentialBU}}, 0, 1\right) \times 15$ (0 if $\text{potentialBU} \le 0$) |

- **Penalties:**
  $$\text{penalty} = (\text{abandoned.length} \times 2) + (\text{expired.length} \times 1) + (\text{arcReductions} \times 2) + (\text{sim.insolvent} ? 10 : 0)$$
- **Final Score:**
  $$\text{final} = \max(0, \text{raw} - \text{penalty})$$
- **Performance Bands:**
  - `85–100`: `"Excellent"`
  - `70–84.9`: `"Good"`
  - `55–69.9`: `"Satisfactory"`
  - `40–54.9`: `"Poor"`
  - `0–39.9`: `"Needs Development"`

### 7.2 Optimal Benchmark (`optimalBenchmark(sim)`)

Ranks all $M$ projects (`sim.projects`, whether 30 or up to 50) by alignment-per-initial-dollar descending (`b.alignment / b.bacInitial`) and greedily packs projects while cumulative `bacInitial <= sim.totalBudget`. Returns `{ count, avgAlignment, ids }`.

### 7.3 Live Projected Score (`liveScore(sim)`)

Clones `sim`, calls `finalize(probe)` as if the simulation ended immediately, and returns `probe.score`.

### 7.4 Rule-Based Hint Advisor (`computeHint(sim)`)

Evaluates 6 priority branches (first match wins) and always appends the context line `"Delivered X of ~Y possible · Z months left."`:
1. **Shortfall (`totalDemand > availableBalance`):** Headline `"Resolve the funding gap before advancing."` (Red). Names the lowest-alignment active project to slow or suspend.
2. **Late-game Expiry Risk (`monthsLeft <= 14` and active projects project past M60):** Headline `"Protect what can still finish."` (Amber). If an expiring project is $\ge 45\%$ complete and `sCurve.length > monthsLeft`, calculates exact compression `a = Math.min(0.6, Math.max(0.1, 1 - (monthsLeft - 1) / rescuable.sCurve.length))` and offers a one-tap **Speed up** action button; otherwise advises abandoning the lowest-alignment expiring project.
3. **Idle Cash (`availableBalance > 1.6 * quarterlyRelease`, affordable finishable candidate exists, `monthsLeft > 16`):** Headline `"Put idle funds to work."` (Green). Recommends the highest-alignment affordable & finishable candidate with a one-tap **Add** action button.
4. **Suspended Projects Exist:** Headline `"Decide on your suspended projects."` (Amber). Recommends resuming the highest-alignment suspended project (+10% duration penalty) or abandoning the weakest.
5. **Spread Too Thin ($\ge 2$ active projects project past M60):** Headline `"You may be spread too thin."` (Amber). Recommends suspending the lowest-alignment active project.
6. **Balanced Portfolio:** Headline `"Portfolio looks balanced."` (Green). Suggests the top affordable finishable candidate (with one-tap **Add** button) if one exists, and displays the live projected score.

### 7.5 Mid-Run Rule-Based PMO Status Report (`generateReport(sim)`)

Generates a 7-section deterministic narrative rendered in Georgia serif prose with uppercase sans-serif headers:
1. `1. EXECUTIVE SUMMARY` (Health label: `"on track"` $\ge 70$, `"under pressure"` $\ge 40$, `"in distress"` $< 40$; delivery progress; deployment rate; expiry trajectory).
2. `2. FINANCIAL POSITION` (Deployment rate, monthly inflation cost on remaining available pool, cash buffer vs half quarterly release, >15% unspent balance warning, sunk costs on abandoned projects).
3. `3. PROJECT PORTFOLIO STATUS` (Full per-project breakdown grouped by Active, Completed, Suspended, and Abandoned).
4. `4. STRATEGIC ALIGNMENT ANALYSIS` (Budget-weighted alignment of active + completed vs pool average, low-alignment $<40\%$ callouts, delivered alignment).
5. `5. RISK PROFILE` (Total risk events and last 5 milestone shock details, imminent expiry list, high monthly burn $>25\%$ of available balance).
6. `6. PORTFOLIO MANAGER ASSESSMENT` (Decision tally, observed strengths, areas requiring attention).
7. `7. RECOMMENDED ACTIONS` (Up to 5 numbered, project-ID-specific action items: speed up $>60\%$ complete at-risk projects, evaluate/suspend other expiring projects, add top 2 high-alignment candidates if balance $>12\%$ of total budget and $>24$ months left, slow high-burn projects, resume completable suspended projects).

### 7.6 Post-Run Performance Assessment (`generateAssessment(sim)`)

Evaluates 11 condition checks against the completed run to populate **What you did well** (`strengths`), **Where to improve** (`improvements`), and a band-specific (or insolvency-specific) **Key insight**:
1. Delivery rate ($\ge 75\%$ vs $\ge 45\%$ vs $< 45\%$ of `maxComp`)
2. Completed strategic alignment ($\ge 70\%$ vs $\ge$ pool average vs $<$ pool average)
3. Abandonment triage quality (abandoned average alignment $<$ pool average vs $\ge$ pool average)
4. Leftover unspent budget ($< 5\%$ vs $> 20\%$ of `totalBudget`)
5. Expired project count ($0$ vs $\ge 3$)
6. Addition timing ($\ge 3$ additions in months 1–20 vs $\ge 2$ additions after month 40)
7. Tempo control usage (used both Slow & Speed vs used neither)
8. Unresumed suspensions (`suspends - resumes > 0`)
9. ARC 30% funding cuts (lists affected project IDs, score penalty, and count still under-funded)
10. Full ARC cutoffs / decommissioned assets (lists affected project IDs and explains wasted BAC + negative benefits cascade)
11. Social Benefits realization ratio ($\ge 85\%$ vs $< 50\%$ of potential BU) and Insolvency termination check.

---

## 8. UI Design System, Themes & Color Palettes

### 8.1 Light & Dark Theme Tokens (`THEMES`)

The application defaults to **Light Mode** (`theme = "light"`) and includes a live header toggle (`Sun` / `Moon` icon) for **Dark Mode** (`theme = "dark"`).

| Token | Light Theme Hex | Dark Theme Hex | Usage |
|---|---|---|---|
| `bg` | `#f4f6fb` | `#0a1019` | Page & shell background |
| `panel` | `#ffffff` | `#111a2b` | Primary card / modal / panel surface |
| `panel2` | `#eef2f8` | `#0e1626` | Secondary inset surface (inputs, stat tiles, inactive chips) |
| `line` | `#d6deea` | `#21304a` | Primary borders & dividers |
| `lineSoft` | `#e6ecf5` | `#1a2740` | Subtle row dividers & chart grid lines |
| `text` | `#16202e` | `#e6edf7` | Primary body & heading text |
| `muted` | `#566379` | `#8da3c0` | Secondary labels & descriptions |
| `faint` | `#8a97ab` | `#5f7290` | Muted metadata, IDs, captions, axis ticks |
| `action` | `#4f46e5` | `#7c83ff` | Primary brand indigo (buttons, active tab underline, current month cursor, pending badge) |
| `actionDim` | `#c7c9f5` | `#3b3f7a` | Dimmed indigo accent |
| `available` | `#94a3b8` | `#64748b` | Available project state color |
| `active` | `#2563eb` | `#3b82f6` | Active project state color (blue) |
| `suspended` | `#d97706` | `#f59e0b` | Suspended state & warning color (amber) |
| `completed` | `#059669` | `#10b981` | Completed state & positive funds color (emerald green) |
| `abandoned` | `#94a3b8` | `#475569` | Abandoned state color (slate grey) |
| `expired` | `#e11d48` | `#f43f5e` | Expired state, danger, & shortfall color (rose red) |
| `arc` | `#9333ea` | `#c084fc` | Annual Recurring Cost (ARC) color (purple) |
| `scrim` | `#1e293b99` | `#04070cdd` | Modal overlay backdrop |
| `shadow` | `0 18px 50px #1e293b33` | `0 24px 60px #000a` | Modal & dropdown elevation shadow |

### 8.2 Chart & Per-Project Identity Palettes

- **Per-Project Identity Palette (`PROJECT_PALETTE`):** Indexed by the project's fixed position in `sim.projects` (`i % 8`) so a project's bar/line color in Gantt and S-Curves never changes when its state changes:
  `["#3498db", "#667eea", "#28a745", "#6f42c1", "#e67e22", "#17a2b8", "#e83e8c", "#20c997"]`
- **Semantic Funding Chart Colors:**
  - `FUND_OK = "#28a745"` (Cumulative funding step-line & positive headroom bars)
  - `FUND_BAD = "#dc3545"` (Total cash requirement line & negative headroom / shortfall bars)
  - `FUND_BAND = "rgba(220,53,69,0.12)"` (Shaded vertical `ReferenceArea` for overloaded periods)
  - `SPEND_NORMAL = "#7cb9e8"` (Cumulative project capital spending line)

### 8.3 Typography, Formatting & Session Storage Conventions

- **Sans-Serif UI Font:** `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
- **Monospace / Tabular Numbers (`mono`):** `fontVariantNumeric: "tabular-nums"`, `fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"` — used for all currency amounts, percentages, project IDs, month counters, and scores.
- **Serif Report Font:** `Georgia, 'Times New Roman', serif` — used exclusively for the body of the mid-run Portfolio Status Report modal.
- **Currency Formatter (`money(n)`):** Formats numbers in millions with 2 decimal places: `"$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "M"` (e.g., `$12.45M`).
- **Percentage Formatter (`pct(n)`):** `(n * 100).toFixed(0) + "%"` (e.g., `75%`).
- **Session Persistence (`saveSession` / `loadSession`):** Uses `localStorage["portfolio_sim_save"]` (with graceful fallback to `window.storage` if running in an embedded artifact wrapper) to persist and resume in-progress runs.

---

## 9. Screen-by-Screen & Component-by-Component UI Specification

### 9.1 Setup Screen (`SetupScreen`)

Centered single-column card layout (`width: min(600px, 96vw)`):
1. **Header & Tagline:**
   - `Gauge` icon + `"Portfolio Simulator"` (`26px`, weight 800) + version badge (`v${SIM_VERSION}`).
   - Subtitle: *"Sixty months. Thirty candidate projects. Enough budget for roughly twenty. Select, fund, slow, and — when the money runs short — decide what gives."*
2. **Splash Banner Image:**
   - `<img src="/splash.jpg" alt="Portfolio Simulator" />` (`width: 100%`, `maxHeight: 220px`, `objectFit: cover`, `borderRadius: 12px`).
3. **Configuration Panel:**
   - **Run Name Input:** Defaults to `Portfolio DD-MM-YYYY`.
   - **Player Registration Box:**
     - Unregistered (`auth === null`): Shows Name input, Email input, and **Register** button (or 6-digit OTP input + **Verify & register** button when `authStep === "code-sent"`).
     - Registered (`auth !== null`): Shows green pill `✓ Registered as <name> — <email>`, **Un-register** button, and (if `email === "khalid0211@gmail.com"`) an **Admin** link to `/admin`.
   - **Difficulty Preset 2×2 Grid:** Tiles for `Learning`, `Standard`, `Advanced`, and `Custom`.
   - **Always-Visible Toggle Cards:**
     - **Integrated Budget Wallet (ARC):** Pill switch (44×24px). Locked off for `Learning`, locked on for `Advanced`.
     - **Social Benefits:** Pill switch (44×24px). Locked on for `Advanced`.
   - **Expandable Custom Parameters Section (`showCustom || preset === "custom"`):**
     - **Custom Project Pool & Total Budget Box (Full-Width Top Card inside Custom Section):**
       - **Project Pool Selector Dropdown:**
         - `🎲 Random Procedural Pool (30 projects)`
         - `👤 My Saved Portfolios`: Lists user's uploaded portfolios (`<Name> (${count} projects · BAC $${totalBac}M)`).
         - `🌐 Global Portfolios`: Lists admin-promoted global portfolios (`🌐 <Name> (${count} projects · BAC $${totalBac}M)`).
       - **Portfolio Action Buttons:**
         - **Import Excel (.xlsx)** button (opens `PortfolioImportModal` to upload & preview up to 50 projects).
         - **Template (.xlsx)** button (downloads a ready-to-edit 30-project `.xlsx` baseline template).
         - **Edit / Delete** buttons when a user-owned custom portfolio is selected.
       - **Total Budget Mode & Input:**
         - When a custom/global portfolio is selected (or when user toggles `"Set explicit $M budget"`), displays a numeric dollar input **`Total Available Budget ($M)`** pre-filled with the portfolio's `defaultBudget`, plus quick-preset pills (`80% of BAC`, `67% of BAC`, `55% of BAC`) and live summary: `Pool total BAC: $X.XXM · Max completable: ~Y of N projects`.
     - **2-Column Parameter Grid:**
       - Column 1: Inflation rate slider (`0%–20%`, step `0.5%`), Funding profile dropdown, Funding frequency dropdown, Budget tightness dropdown (disabled when explicit `$M` budget is active), Risk environment dropdown.
       - Column 2: Political projects slider (`0–5`, step `1`), Concurrent cap dropdown, Approval lag dropdown, Scoring visibility dropdown.
   - **Action Bar:**
     - **Start new run** (`Btn kind="primary"`, disabled with label `"Register to start"` if `!auth`).
     - **Leaderboard** button with live subtitle (`"X runs · best Y"` or `"no runs yet"`).
     - **How to play** button (opens `RulesModal`).
     - **Resume** button (rendered if `localStorage["portfolio_sim_save"]` has a saved session).
4. **7-Cell Active Settings Summary Bar:**
   - Displays live values for: `Inflation`, `Funding`, `Cadence`, `Political`, `Risk`, `Wallet`, `Benefits`.

### 9.2 Main Simulation Shell (`100dvh` Split View)

When a simulation is running (`sim.status === "running"`), the viewport is locked to `height: 100dvh; display: flex; flex-direction: column; overflow: hidden` (collapsing to natural scrolling single-column on screens $\le 880\text{px}$).

#### 9.2.1 Sticky Top Header
- **Left:** `Gauge` icon + `sim.name` (plus a subtle badge if running a custom portfolio, e.g., `${sim.projects.length} projects`).
- **Center (`QuarterTimeline`):**
  - Top row: `Month X / 60` on the left, `proj. Y` on the right (hidden if `blindScore`).
  - Middle row: **20-segment Quarter Bar** (`Q1`–`Q20`, 3 months per box).
    - Past quarters: solid `T.action`.
    - Current quarter: `T.action + "bb"` with a circular dot marker above the box.
    - Final 4 quarters (`Q17–Q20`, Months 49–60): tinted red (`T.expired + "33"`) as the "danger zone".
    - Next scheduled release period: marked with a green tick below the box.
  - Bottom row: Labels `Q1`, `Q5`, `Q10`, `Q15`, `Q20 ⚠`.
- **Right Controls:**
  - **Available Balance Readout:** Uppercase `"AVAILABLE"` label + large monospace green figure (`money(sim.availableBalance)`).
  - **Undo Button (`↩ Undo`):** Enabled whenever `undoStack.length > 0` (reverts the last decision made during the current month before advancing).
  - **Hint Button:** Lightbulb icon + `"Hint"` (opens `HintModal`, shortcut `H`).
  - **Theme Toggle Button:** `Moon` / `Sun` icon.
  - **Save Button:** `Save` icon (persists `sim` to `localStorage["portfolio_sim_save"]` and shows toast `"Session saved"`).
  - **Overflow Menu (`⋯`):** Opens dropdown containing:
    - **Status report** (opens `PortfolioReportModal`)
    - **Export projects (.xlsx)** (exports current project pool & run status to Excel)
  - **Advance Button (`Advance →`):**
    - Dynamic button style: `primary` (safe), `warn` (when `demandThisMonth > 0.8 * availableBalance`), or `danger` (when `demandThisMonth > availableBalance`).
    - **Hover Preview Popover:** Displays `Month X preview` with `Demand`, `Available`, `Net`, and (if a release is due within 1–3 months) `⚡ <Cadence> release in N months · $X.XXM`.

#### 9.2.2 Persistent KPI Strip (`PortfolioDashboard`)
Sits directly below the header across the full width, displaying 3 to 5 metric cards with progress bars:
1. **Funding Efficiency:** `committed / released` percentage and dollar amounts (`committed = sim.released - sim.availableBalance`).
2. **Strategic Alignment:** Budget-weighted alignment across active + completed projects (displays `"—"` and `"Strategic Alignment (hidden)"` when `blindAlignment` is active).
3. **Completed:** `${completed.length}/${sim.maxComp}` projects delivered vs target.
4. **ARC Exposure** *(only when `arcEnabled`)*: Cumulative ARC paid to date + current monthly run-rate (`$X.XXM/mo`).
5. **Social Benefits** *(only when `benefitsEnabled`)*: Cumulative BU generated + dollar social value equivalent (`$0.02M/BU`), flipping to red (`T.expired`) if net negative.

#### 9.2.3 Left Pane — Monthly Decision Panel (`minmax(340px, 420px)`)
1. **Dismissible Risk Event Alerts:** Appear at the top of the left pane whenever `sim.alerts` is non-empty, detailing the project title, milestone (`25%`, `50%`, `75%`), cost shock `% → new BAC`, and duration shock `%`.
2. **Two-Tab Segmented Switcher:**
   - **Tab 1: `Portfolio` (badge: count of Active + Pending + Suspended)**
     - **Active Section (`ActiveRow`):**
       - Left border color-coded by health: red (`critical`, projected end $> 60$), amber (`warning`, projected end $> 57$ or monthly burn $> 25\%$ of available balance), or green (`ok`).
       - Hovering or clicking a row sets `focusedProjectId`, cross-highlighting that project in the Gantt chart, S-Curves tab, and 3D Development Map.
       - Shows ID, title, `BAC $X.XXM · spend $Y.YYM/mo · ends MZ`, `subCategory · ARC X%`.
       - Inline status badges: `🔒 Locked to M24` or `Political`, `⚠ Expires MZ`, `Late risk MZ`, `High burn`.
       - Right badges: Strategic Alignment % (unless `blindAlignment`) and Done % + horizontal progress bar.
       - Action buttons: **Speed** (opens `SpeedModal`), **Slow** (opens `SlowModal`), **Suspend**, and **Abandon** (two-step inline confirmation: clicking `Abandon` turns into `Confirm −2 pts` + `X` cancel, auto-resetting after 3 seconds; disabled during political lock).
     - **Pending Approval Section (`PendingRow`):** Shown when `pendingList.length > 0`. Displays locked BAC and countdown (`starts in N months`).
     - **Suspended Section (`SuspendedRow`):** Shown when `suspendedList.length > 0`. Displays inflating remaining cost (`remaining cost rising · now $X.XXM` where `remInflated = (p.bacCurrent - p.nominalSpent) * inflator(sim.monthlyRate, sim.month)`) and **Resume (+10%)** / **Abandon** buttons.
     - **Completed Section (`CompletedRow`):** Shown when `(arcEnabled || benefitsEnabled) && completedList.length > 0` (collapsed by default). Shows delivery month, current ARC/mo (or reduced status + backlog owed + **Restore full funding** button), reduction exhaustion warning if `arcReductionCount >= 2`, and current/cumulative Benefit Units.
   - **Tab 2: `Add projects` (badge: count of Available projects)**
     - **Top Picks (`QuickAddStrip`):** Surfaces the top 3 affordable, finishable (`durationPlanned <= 61 - sim.month`) available projects sorted by alignment descending, with one-click **Preview** (eye icon) and **Add** (`+` icon) buttons.
     - **Available Pool (`AvailableTable`):**
       - **Search & Category Bar:** Compact search input (`🔍 Search ID, title, subcategory...`) + category filter pills (`All`, `Infra`, `Social`, `Agri`) + **Export (.xlsx)** quick button.
       - **Filter Chips:** `Affordable` (default active), `Can finish`, and `High alignment ≥70%` (hidden if `blindAlignment`), plus count indicator (`X of Y`).
       - **Sort Chips:** `Alignment` (hidden if `blindAlignment`), `BAC`, `Duration`, `Risk`.
       - Concurrent cap warning banner when `(active + pending) >= concurrentCap`.
       - Scrollable list of project cards showing ID, title, inflated BAC, planned duration, subcategory, cost/duration risk percentages, ARC rate, BU/mo rate (if `benefitsEnabled`), alignment badge, **Preview** button, and **Add** button.

#### 9.2.4 Right Pane — Portfolio Dashboard (6 Tabs)
Header shows `"Next <cadence> release: Month X · $Y.YYM"` above the active tab view (keyboard shortcuts `1`–`6` switch tabs):

1. **Tab 1: `Cash Flow` (`CashFlowTab`)**
   - Displays a red notification dot on the tab button whenever `crunchAhead` is true (any current or future month has cumulative requirement > cumulative funding).
   - Top bar: `FundingCallout` banner (green `"No funding overload..."` or red `"Funding overload: <period ranges> (worst shortfall $X.XXM)"`) + `GranToggle` chips (`Monthly` / `Quarterly` / `Yearly`, persisted in `localStorage["sim.granularity"]`).
   - Chart: Recharts `LineChart` plotting cumulative series across all periods:
     - `Total cash requirement` (thick red `#dc3545`, width 3.5)
     - `Project spending` (light blue `#7cb9e8`, width 2)
     - `ARC (recurring)` (purple `T.arc`, width 2, when `arcEnabled`)
     - `Cumulative funding` (green step-after line `#28a745`, width 2.5)
     - Shaded red `ReferenceArea` bands over overloaded periods + vertical indigo `ReferenceLine` at the current period.
   - Bottom summary row: 3 stat tiles (`Required · M{month}`, `Available`, `Net this month`).

2. **Tab 2: `Funds` (`FundsTab`)**
   - Top bar: `FundingCallout` + `GranToggle` (`Monthly` / `Quarterly` / `Yearly`).
   - Upper visual: Recharts `BarChart` of net funding headroom (`cumulativeFunding - cumulativeRequirement`), with green bars (`#28a745`) where headroom $\ge 0$ and red bars (`#dc3545`) where headroom $< 0$.
   - Lower visual: Sticky-header & sticky-footer scrollable schedule table with columns: `Period` (tagged `actual` for past, `now` for current), `Funding release`, `Cash requirement`, `Cumulative funding`, and color-coded `Headroom`, plus a bold `Total` footer row.

3. **Tab 3: `Gantt` (`GanttTab`)**
   - Horizontal timeline across 60 months for all non-available projects.
   - Each row displays a status-colored dot, Project ID & title, current-month vertical indigo cursor, project bar colored by `projectColorById` (dimmed for suspended/abandoned/expired, highlighted when hovered in the Left Pane), vertical tick marks at `25%`, `50%`, and `75%` milestones, and a white `Flag` icon if any risk event fired on that project.

4. **Tab 4: `S-Curves` (`SCurveTab`)**
   - Project filter chips: `All` plus individual chips for every started project.
   - **`All` View:** Plots dotted cumulative `% of BAC` lines for each individual project alongside a thick solid indigo line (`Portfolio total`) representing combined cumulative nominal spend as a percentage of combined BAC.
   - **Single-Project View:** Plots the original baseline S-curve (`dashed`) against actual recorded draws + remaining current plan (`solid`), clearly illustrating schedule compression, slowdowns, suspensions (flat segments), and risk shocks.

5. **Tab 5: `Development Map` (`DevelopmentMapTab`)**
   - Lazy-loaded 3D interactive city view of all $M$ projects ($1 \dots 50$), detailed in Section 10.

6. **Tab 6: `KPIs` (`KpiTab`)**
   - 3 `Gauge270` circular 270-degree SVG dials: `Delivered X/Y`, `Budget used`, and `Projected score (Band)`.
   - Stat tiles: `Avg alignment (portfolio)`, `Projects at risk`, `Months remaining`, `Available funds`, `Total budget`, `ARC this month` (or `"Off"`), and `Benefits generated` + `Benefits this month` (or `"Off"`).

### 9.3 All Modals & Overlays

1. **Project Preview Modal (`ProjectPreviewModal`, width `680px`):**
   - Clones `sim` and simulates adding the candidate project to compare baseline vs hypothetical cash flows.
   - Stat tiles: `BAC` (inflation-adjusted), `Duration` (`ends M{projEnd}`), `Strategic fit` (unless `blindAlignment`), `Burn increase` (`per month`), `ARC rate`, and `Benefit rate` (if `benefitsEnabled`).
   - Dual-pair Recharts `LineChart`: dashed vs solid green lines (`Available (now)` vs `Available (+ project)`) and dashed vs solid red lines (`Required (now)` vs `Required (+ project)`).
   - Footer: `Cancel` and `Select — Add to Portfolio`.

2. **Slow Down Modal (`SlowModal`, width `460px`):**
   - Range slider `5%–80%` (step `5%`, default `30%`).
   - Live before/after stat tiles: `Remaining months` (`rem → newRem`) and `Monthly burn` (`burnNow → burnAfter`).

3. **Speed Up Modal (`SpeedModal`, width `460px`):**
   - Range slider `5%–60%` (step `5%`, default `30%`).
   - Live before/after stat tiles: `Remaining months`, `Monthly burn`, `Finishes` (`M{now} → M{after}`), and `BAC (+ crash premium)`.

4. **Blocking Shortfall Resolution Panel (`ShortfallPanel`, width `460px`):**
   - Triggered when clicking **Advance** while `totalDemand > availableBalance`. Cannot be dismissed by clicking the backdrop.
   - Top tiles: `Demand`, `Available`, and `Gap`.
   - **Active Projects List:** Sorted by monthly spend descending, with quick-action buttons: `−30%` (30% slowdown), `Pause` (Suspend), and `Trash2` (Abandon).
   - **Completed Projects Consuming ARC List** *(if `arcEnabled` and eligible completed projects exist)*: Sorted by current ARC descending. Offers `−30% ARC (−2 pts)` if `arcReductionCount < 2`, or `Abandon project` if `arcReductionCount >= 2`.
   - **Insolvency Early Termination Box:** Displayed while `!resolved`. Includes a two-step confirm button: `End simulation — no funds available (−10 pts)` → `Confirm − end simulation (−10 pts)`.
   - Footer: `Confirm & advance` button (disabled until `Gap <= 0`).

5. **Rules Modal (`RulesModal`, width `560px`):**
   - Header: `BookOpen` icon + `"How to play"` + close button.
   - 6 horizontal tab buttons: `Objective`, `Projects`, `Actions`, `Funding`, `Risk`, `Scoring`.
   - Tab bodies explain the 60-month loop, inflation effects, project states, Beta(2,2) S-curves, action trade-offs, release cadence, 25%/50%/75% risk checkpoints, and composite scoring weights + penalties.

6. **Hint Modal (`HintModal`, width `460px`):**
   - Header: `Lightbulb` icon + color-coded `hint.headline`.
   - Bulleted list of `hint.points` (with the final delivery/months-left context line in muted text).
   - Footer: Optional one-tap primary action button (`+ Add PXX` or `⏩ Speed up PXX` when `hint.action` is present) + `Got it` close button + heuristic disclaimer caption.

7. **Mid-Run Portfolio Status Report Modal (`PortfolioReportModal`, width `760px`):**
   - Header: `FileText` icon + `"Portfolio Status Report"` + subtitle `Month X / 60 · <run name> · projected score Y (<Band>)`.
   - Body: Scrollable 7-section PMO narrative from `generateReport(sim)` styled with uppercase indigo sans-serif section headers and Georgia serif body paragraphs.
   - Footer: Caption `"Rule-based PMO report · generated from simulation data"` + `Close` button.

8. **Post-Run Performance Assessment Modal (`AssessmentModal`, width `460px`):**
   - Header: `Lightbulb` icon + `"Performance Assessment — <playerName>"`.
   - 3 summary stat tiles: `Projects added`, `Tempo actions` (`X slow · Y speed`), and `Abandonments`.
   - **`What you did well` section:** Green `✓` bullet list of `assessment.strengths`.
   - **`Where to improve` section:** Amber `→` bullet list of `assessment.improvements`.
   - **`Key insight` callout box:** Left-bordered card with band-colored accent displaying `assessment.keyInsight`.

9. **Leaderboard Modal (`LeaderboardModal`, width `540px`):**
   - Header: `Award` icon + `"Leaderboard"` + total run count.
   - Filter chips: `All`, `Learning (N)`, `Standard (N)`, `Advanced (N)`, `Custom (N)`.
   - Fetches top runs from `GET /api/leaderboard?preset=all&limit=500`, falling back to `localStorage["portfolio_sim_leaderboard_v1"]` when offline.
   - Sticky-header scrollable table (top 50 for selected tab) with columns: `#` (`🥇`, `🥈`, `🥉`, `4..50`), `Player`, `Run`, `Mode` (when `All` tab active), `Score` (+ band), `✓` (completed count), and `Date`. Highlights the player's just-completed run when opened from Debrief.

10. **Custom Portfolio Import & Editor Modal (`PortfolioImportModal`, width `860px`):**
    - Detailed in Section 6.3. Allows uploading `.xlsx`/`.csv`, inline editing up to 50 project rows, setting portfolio name & default budget, and saving to the user's account.

### 9.4 End-of-Run Debrief Screen (`Debrief`)

1. **Header:** Trophy/Award icon + `"Run debrief"`, player name, run name, inflation rate, difficulty preset badge, and buttons for **Export (.xlsx)**, **Leaderboard**, and **Assessment**.
2. **Insolvency Banner** *(if `sim.insolvent`)*: Red alert banner stating `"Simulation ended early at Month X of 60 — no funds were available to continue (−10 pts)."`
3. **Hero Score Panel:**
   - Large 64px monospace final score (`Math.round(s.final)`) + performance band badge.
   - Horizontal `ScoreBar` breakdown for `Delivery`, `Strategic alignment`, `Budget efficiency`, and (if `benefitsOn`) `Social benefits`.
   - Formula breakdown line: `raw X.X − penalties Y (abandoned A×2, expired E×1, ARC-reduced R×2, insolvency −10) = final`.
4. **Comparison & Outcome Grid (2 columns):**
   - Left card (`You vs the optimal portfolio`): Compares `Projects delivered` and `Avg alignment delivered` against `optimalBenchmark(sim)`, plus `Pool average alignment`.
   - Right card (`Outcome mix`): Horizontal progress bars for `Completed`, `Expired`, and `Abandoned` counts out of `sim.projects.length` (dynamically supporting 30 or up to 50 projects).
5. **Decision Timeline Panel:**
   - Toggle chips: `📈 Visual` vs `📋 List`.
   - **Visual View (`DecisionTimeline`):** 60-month horizontal axis with quarter ticks and alternating above/below circular symbol nodes for every decision:
     - `add`: `+`, `slow`: `↓`, `speed`: `↑`, `suspend`: `⏸`, `resume`: `↩`, `abandon`: `✕`, `arc_reduce`: `▽`, `arc_restore`: `△`, `arc_cutoff`: `⊘`.
   - **List View:** Scrollable chronological log (`M{month}`, action type + percentage, project title).
6. **Footer Action:** `New run` button to return to the Setup Screen.

---

## 10. 3D Development Map Specification (`src/devmap/`)

The **Development Map** tab renders all $M$ projects ($1 \dots 50$) as an interactive 3D miniature world using `@react-three/fiber` and `@react-three/drei`, featuring **12 realistic subcategory-specific 3D architectural models** and **live construction lifecycle visuals**.

### 10.1 District Layout & Dynamic Grid (`cityLayout.js`)
- Projects are grouped into **3 category districts** laid out left-to-right along the X-axis and centered on the origin `(0, 0, 0)`:
  1. **Physical Infrastructure & Transport** (`"Infrastructure"`, ground tint `#7C74A8` muted violet-grey)
  2. **Social Sectors (Education & Health)** (`"Social"`, ground tint `#5FA1A8` muted teal)
  3. **Agriculture, Irrigation & Resources** (`"Agriculture"`, ground tint `#9AA36B` muted olive)
- Within each district, plots are arranged in a deterministic grid (`CELL = 4.4` world units center-to-center, `DISTRICT_GAP = 8`, `GROUND_PAD = 2.6`) sorted by Project ID (`P01..P50`).
- **Dynamic Column Scaling for 50-Project Portfolios:** `cols = count > 16 ? 5 : 4` per district so custom portfolios with up to 50 projects remain compact and well-framed by the camera.
- Paved internal district roads/walkways render between the plot rows and columns.

### 10.2 12 Realistic Subcategory 3D Architectural Archetypes (`buildingShape.js` & `Building.jsx`)
Instead of simple boxes or cylinders, each project renders a detailed, recognizable multi-mesh 3D model determined by its `p.subCategory`. The vertical scale (`height` from `makeHeightScale(metric, projects)`) scales the primary structure proportionally while keeping ground details (trees, ponds, vehicles, helipads, roofs) crisp:

| # | Subcategory | Archetype Key | 3D Multi-Mesh Architectural Composition |
|---|---|---|---|
| 1 | **Paved Roads & Highways** | `"highway"` | Elevated dual-carriageway concrete highway viaduct supported by twin tapered concrete piers, dark asphalt deck with white dashed centerline stripes, guardrails, and twin cable-stayed suspension pylons rising to `height`. |
| 2 | **Feeder & Rural Roads** | `"rural_road"` | Winding rural road deck crossing an angled steel/timber truss bridge over a blue stream channel, flanked by grassy banks and low-poly roadside trees. Bridge truss height and span scale with `height`. |
| 3 | **Buildings (Administrative)** | `"civic_complex"` | Stepped modern/neoclassical government complex: wide colonnade podium base, main central tower with horizontal window band tiers, flanking side wings, rooftop mechanical penthouse, and a front courtyard flagpole. |
| 4 | **Large-Scale Dams & Reservoirs** | `"dam"` | Massive sloped concrete arch-gravity dam wall flanked by rocky abutment wings, holding back an elevated deep-blue water reservoir basin behind the dam, with 3 white water spillway chutes and a powerhouse at the toe. |
| 5 | **Primary & Secondary Schools** | `"school"` | U-shaped multi-wing school campus with warm pitched roofs, a central courtyard with a green miniature sports pitch, and a prominent corner clock/bell tower rising to `height`. |
| 6 | **Polytechnic & Technical Schools** | `"polytechnic"` | Industrial engineering workshop hall with a 3-bay sawtooth north-light factory roof paired with a multi-story technical laboratory block, industrial flue chimney, and blue rooftop solar panel arrays. |
| 7 | **General & Tertiary Hospitals** | `"hospital"` | H-plan / cross-wing multi-story medical center with a central high-rise ward tower, prominent red cross emblem (`+`) on the facade, ground-floor emergency ambulance canopy, and a circular rooftop helipad marked `"H"`. |
| 8 | **Rural Health Centers** | `"clinic"` | L-shaped community clinic compound with overhanging terracotta/metal veranda roofs, a prominent red medical cross gable sign, an elevated steel water storage tank tower, and a communication dish. |
| 9 | **Irrigation & Drainage Systems** | `"irrigation"` | Concrete-lined main irrigation canal with glowing blue water channel, an overhead multi-bay radial sluice gate control structure (scaling with `height`), a brick pumping station house, and perpendicular feeder channels. |
| 10 | **Agricultural Research & Extension** | `"agri_research"` | Trio of translucent sky-tinted vaulted polycarbonate greenhouses alongside a two-story agronomy laboratory block (scaling with `height`) and parallel green/gold striped experimental crop rows. |
| 11 | **Livestock & Veterinary Services** | `"livestock"` | Classic gambrel-roofed livestock barn complex paired with twin cylindrical metallic feed silos (scaling with `height`, topped with hemispherical domes), a white-cross veterinary wing, and a fenced timber paddock corral. |
| 12 | **Forestry & Watershed Development** | `"forestry"` | Terraced green earth mound populated with multi-tiered pine/conifer and deciduous tree clusters, a blue watershed retention pond at the base, and a tall timber/steel fire-watch lookout tower rising to `height`. |

### 10.3 Construction Lifecycle & Visual State Realism
Each plot visually reflects both its status color (`STATE_COLORS`) and its real-time construction progress (`prog = p.bacCurrent ? p.nominalSpent / p.bacCurrent : 0`):
- **`available` (`#5B6472` Slate Grey):** Renders at 75% opacity with a subtle wireframe blueprint overlay. If `isAddable(p, sim)` is true, the plot sits on a glowing gold base pad (`#EAB308`).
- **`pending` (`#8A6FE8` Violet):** Renders the foundation slab, perimeter construction posts, and a low translucent hologram of the upcoming structure.
- **`active` (`#2563EB` Blue — Under Construction):**
  - The structure physically scales/builds up based on completion progress (`0.35 + 0.65 * prog` of its target height) while an open wireframe scaffolding cage outlines the full target height.
  - A **3D Tower Crane** (mast, rotating jib arm, counter-jib, and suspended hook cable) stands beside the structure and **slowly rotates** (`useFrame`) while the project is active.
- **`suspended` (`#D97706` Amber):** Structure frozen at current progress height with a stationary tower crane and an amber warning beacon above the mast.
- **`completed` (`#059669` Green):** Full 100% architectural detail, no crane/scaffolding, lit accent details, perimeter landscaping trees on the plot corners, and an emerald trim plinth. If `p.arcReduced` is true, an amber/purple maintenance badge floats above the roof.
- **`abandoned` (`#D1483F` Red) & `expired` (`#7A6A57` Brown):** Desaturated/darkened unfinished structure with red/brown hazard markers.

### 10.4 Height Metric Switcher & Interactive Inspector (`MapLegend.jsx` & `MapInspector.jsx`)
- **Top-Center HUD Switcher:** Scales building heights (`MIN_HEIGHT = 1.0`, `MAX_HEIGHT = 8.0`, `FLAT_HEIGHT = 0.2`) by 4 metrics:
  1. `Budget (BAC)` (`p.bacCurrent || p.bacInitial`, default)
  2. `ARC / month` (`bac * p.arcRate / 12`)
  3. `Benefit Units` (`p.buRate`)
  4. `Duration` (`p.durationCurrent || p.durationPlanned`)
- **Bottom HUD Legend:** Displays the 7 state color swatches + `Affordable now` gold swatch on the left, and the 12 subcategory architectural icons/labels grouped by the 3 districts on the right.
- **Hover & Click Interactions:**
  - Hovering any plot shows a floating 3D HTML tooltip (`P01 Title · Subcategory · State`).
  - Clicking an **Available** plot opens `ProjectPreviewModal`.
  - Clicking any **non-Available** plot highlights it with a glowing teal torus ring (`ACCENT = "#43D9C7"`) and opens the centered `MapInspector` popup card with full project stats and state-valid action buttons (`Slow`, `Speed up`, `Suspend`, `Abandon`, `Resume`, `Restore ARC funding`).

---

## 11. Admin Dashboard UI (`/admin`)

Served from `server/public/admin.html` as a zero-dependency vanilla HTML/CSS/JS single-page dashboard:
1. **Login Card:** Password input for `ADMIN_KEY`. Saves key to `localStorage["sim_admin_key"]` and fetches `GET /api/admin/summary` with header `X-Admin-Key`.
2. **Toolbar:**
   - **Download runs (CSV)** → `GET /api/admin/export/runs.csv`
   - **Download users (CSV)** → `GET /api/admin/export/users.csv`
   - **Download portfolios (CSV)** → `GET /api/admin/export/portfolios.csv`
   - **Download DB backup** → `GET /api/admin/backup` (downloads `simulator-backup-YYYY-MM-DD.db`)
   - **Sign out** link
3. **Summary Cards & Tables:**
   - KPI stat counters: `Verified users`, `Completed runs`, `Saved portfolios`, and `Global portfolios`.
   - **`Custom Portfolios` Management Table (New):**
     - Columns: `Portfolio Name`, `Owner`, `Email`, `Projects`, `Total BAC ($M)`, `Default Budget ($M)`, `Created`, `Visibility (`🌐 Global` / `🔒 Private`)`, and `Actions`.
     - Actions per row:
       - **Make Global / Revoke Global** toggle button (`PATCH /api/admin/portfolios/:id` with `{ isGlobal: !row.is_global }`). When marked Global, this portfolio immediately becomes available to all users in the Custom Mode dropdown.
       - **Delete** button (`DELETE /api/admin/portfolios/:id`).
   - `Runs by mode` table (`Mode`, `Runs`, `Avg score`, `Avg minutes`).
   - `Top 10 scores` table (`#`, `Score`, `Band`, `Player`, `Email`, `Mode`, `When`).
   - `Most recent runs` table (latest 20 runs with duration in minutes).
   - `Verified users` table (`Email`, `First seen`, `Last verified`).
4. **CLI Usage Report (`server/src/report.js`):**
   - Run `npm run report` inside `server/` to print a formatted ASCII summary of verified users, custom/global portfolios, runs by preset, top 10 scores, and most recent 10 runs directly in the terminal.

---

## 12. Project Directory Structure, Environment Variables & Deployment

### 12.1 Workspace Directory Tree

```text
Simulator-2/
├── server/                        # Express + SQLite Backend
│   ├── data/
│   │   └── sim.db                 # SQLite database (auto-created with WAL mode)
│   ├── public/
│   │   └── admin.html             # Self-contained Admin Portal UI (with Global Portfolio management)
│   ├── src/
│   │   ├── env.js                 # MUST be imported first in index.js to load .env in ESM
│   │   ├── index.js               # Express entry point (binds 0.0.0.0:PORT)
│   │   ├── db.js                  # SQLite initialization & DDL schema (users, email_codes, runs, custom_portfolios)
│   │   ├── auth.js                # /api/auth/request-code, /api/auth/verify, requireAuth
│   │   ├── email.js               # Nodemailer SMTP transport + console dev logger
│   │   ├── runs.js                # POST /api/runs, GET /api/leaderboard
│   │   ├── portfolios.js          # GET/POST/PUT/DELETE /api/portfolios (user & global custom portfolios)
│   │   ├── admin.js               # /api/admin/summary, /api/admin/portfolios, CSV exports, live SQLite backup
│   │   └── report.js              # CLI usage report script (npm run report)
│   ├── .env.example
│   └── package.json
└── sim-app/                       # React 19 + Vite 8 Frontend
    ├── public/
    │   ├── splash.jpg             # Setup screen hero image
    │   ├── favicon.svg
    │   ├── icons.svg
    │   └── robots.txt
    ├── src/
    │   ├── main.jsx               # React root mount
    │   ├── App.jsx                # Complete simulation engine, state, modals, Excel import/export, 2D charts & UI
    │   ├── excelPortfolios.js     # SheetJS (.xlsx) 12-column export, multi-sheet run export, parser & validator
    │   ├── App.css
    │   ├── index.css
    │   └── devmap/                # Lazy-loaded 3D Development Map module (12 realistic subcategory archetypes)
    │       ├── DevelopmentMapTab.jsx
    │       ├── Building.jsx       # 12 subcategory 3D models + animated construction crane & lifecycle visuals
    │       ├── buildingShape.js   # 12 subcategory descriptors & district mappings
    │       ├── cityLayout.js      # Dynamic 4/5-column district layout supporting up to 50 projects
    │       ├── MapInspector.jsx
    │       ├── MapLegend.jsx
    │       └── mapPalette.js
    ├── .env.example
    ├── .node-version              # Pinned to 22.12.0
    ├── vite.config.js             # Proxies /api and /admin to http://localhost:4000
    └── package.json
```

### 12.2 Package Dependencies

- **Backend (`server/package.json`):**
  - `"type": "module"`
  - Dependencies: `better-sqlite3` (`^11.8.1`), `cors` (`^2.8.5`), `dotenv` (`^16.4.7`), `express` (`^4.21.2`), `express-rate-limit` (`^7.5.0`), `jsonwebtoken` (`^9.0.2`), `nodemailer` (`^6.10.0`), `zod` (`^3.24.2`).
- **Frontend (`sim-app/package.json`):**
  - `"type": "module"`
  - Dependencies: `react` (`^19.2.7`), `react-dom` (`^19.2.7`), `recharts` (`^3.9.0`), `lucide-react` (`^1.21.0`), `three` (`^0.185.1`), `@react-three/fiber` (`^9.6.1`), `@react-three/drei` (`^10.7.7`), `xlsx` (`^0.18.5`).
  - DevDependencies: `vite` (`^8.1.0`), `@vitejs/plugin-react` (`^6.0.2`), `oxlint` (`^1.69.0`).

### 12.3 Environment Variables & Production Deployment Checklist

#### Backend (`server/.env`)
```ini
PORT=4000
NODE_ENV=production
JWT_SECRET=<openssl rand -hex 32>
TOKEN_TTL_DAYS=365
CODE_TTL_MIN=10
ADMIN_KEY=<openssl rand -hex 16>
SQLITE_PATH=/data/sim.db

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
MAIL_FROM="Portfolio Simulator <no-reply@yourdomain.com>"

# Set if frontend and API are hosted on separate subdomains:
CORS_ORIGIN=https://simulator.projectadvisor.cloud
```

#### Frontend (`sim-app/.env`)
```ini
# Leave unset if same-origin behind nginx/reverse-proxy (defaults to "/api");
# set at build time if backend is on a separate subdomain:
VITE_API_URL=https://api.projectadvisor.cloud/api
SIM_VERSION=2.0.0
```

#### Critical Implementation Notes for Rebuilding From Scratch
1. **ESM `.env` Load Order:** In Node ES Modules (`"type": "module"`), `import "./env.js"` **must** be the very first line of `server/src/index.js` so `dotenv.config()` executes before `auth.js`, `admin.js`, `portfolios.js`, or `email.js` read `process.env` constants at module evaluation time.
2. **Container Binding & Reverse Proxy:** Always bind Express to `"0.0.0.0"` (`app.listen(PORT, "0.0.0.0")`) and set `app.set("trust proxy", 1)` so `express-rate-limit` reads the true client IP from `X-Forwarded-For`.
3. **Persistent SQLite Volume:** In Docker/Coolify deployments, mount a persistent volume at `/data` and set `SQLITE_PATH=/data/sim.db` so container redeploys preserve `users`, `email_codes`, `runs`, and `custom_portfolios`.
