# Reusable Application Blueprint: GitHub + Coolify VPS Deployment + Email Code Login + Persistent VPS Database

This guide documents the complete, battle-tested architecture and deployment workflow used for **Portfolio Simulator 2.0 (`Simulator-2`)**. You can give this `.md` file directly to an AI coding assistant in any future project to replicate the same setup:

1. **Monorepo Single-Container Architecture** (Vite/React Frontend + Node/Express Backend)
2. **Passwordless Email Verification Code (OTP) Login + JWT Auth**
3. **Persistent SQLite Database on VPS** (`better-sqlite3` + WAL mode + Coolify Persistent Volume + Hot Backups)
4. **GitHub Repository Setup & Push Workflow**
5. **Coolify VPS Deployment (Multi-stage Dockerfile, Persistent Storage, Env Vars, & Automated API Deployment)**

---

## 1. Project Folder Structure

Use a two-folder monorepo layout where the Node/Express server serves both the `/api/*` endpoints and the compiled frontend static bundle (`dist/`) in production:

```text
my-app/
├── Dockerfile                  # Multi-stage build (builds frontend + runs backend)
├── package.json                # Root convenience scripts
├── .gitignore                  # Excludes node_modules, dist, .env, and *.db files
├── server/                     # Node.js + Express backend
│   ├── package.json
│   ├── .env                    # Local secrets (git-ignored)
│   ├── .env.example            # Template committed to git
│   ├── data/                   # Local SQLite database directory (git-ignored)
│   ├── public/
│   │   └── admin.html          # Optional static admin dashboard
│   └── src/
│       ├── env.js              # Preloads dotenv before other ES module imports
│       ├── index.js            # Express app entry point + static frontend hosting
│       ├── db.js               # SQLite connection, WAL pragma, schema & migrations
│       ├── auth.js             # Email 6-digit OTP request, verify & JWT middleware
│       ├── email.js            # Nodemailer SMTP sender with dev console fallback
│       └── admin.js            # Admin stats, CSV export & live SQLite .db backup
└── client/ (or sim-app/)       # Vite + React frontend
    ├── package.json
    ├── vite.config.js          # Dev proxy (/api -> localhost:4000)
    └── src/
```

---

## 2. Database on VPS (SQLite + WAL + Persistent Volume + Hot Backup)

Using `better-sqlite3` in WAL (`Write-Ahead Logging`) mode gives single-VPS applications zero-latency reads/writes without running a separate Postgres/MySQL container, while persisting data across container deployments via a **Coolify Persistent Volume**.

### 2.1 Backend Dependencies (`server/package.json`)

```json
{
  "name": "app-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "express-rate-limit": "^7.5.0",
    "jsonwebtoken": "^9.0.2",
    "nodemailer": "^6.9.16",
    "zod": "^3.24.1"
  }
}
```

### 2.2 Database Initialization (`server/src/db.js`)

- Reads `process.env.SQLITE_PATH` (set to `/data/app.db` on Coolify VPS, or defaults to `./data/app.db` locally).
- Automatically creates the parent directory so first boot on an empty VPS volume succeeds.
- Enables `WAL` mode and `foreign_keys`.
- Uses `CREATE TABLE IF NOT EXISTS` and safe `ALTER TABLE` blocks for zero-downtime schema additions.

```javascript
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(__dirname, "..", "data", "app.db");

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
`);

// Safe additive migration pattern for future columns:
for (const colDef of [
  // "role TEXT DEFAULT 'user'",
]) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${colDef}`);
  } catch {}
}
```

### 2.3 Online Hot Backup Endpoint (`server/src/admin.js`)

Because SQLite in WAL mode uses `.db`, `.db-wal`, and `.db-shm` files, always use `db.backup(tmpFile)` to download a clean, consistent single-file snapshot over HTTP:

```javascript
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";

// Protect with requireAdmin middleware checking req.headers["x-admin-key"] === process.env.ADMIN_KEY
adminRouter.get("/admin/backup", requireAdmin, async (_req, res) => {
  const tmpFile = path.join(os.tmpdir(), `db-backup-${Date.now()}.db`);
  try {
    await db.backup(tmpFile);
    const data = fs.readFileSync(tmpFile);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="backup.db"');
    res.send(data);
  } catch (e) {
    console.error("[admin] backup failed:", e.message);
    res.status(500).json({ error: "backup_failed" });
  } finally {
    fs.unlink(tmpFile, () => {});
  }
});
```

---

## 3. Passwordless Email Code (OTP) Login System

Users sign in by entering their **Name** and **Email**. The server generates a 6-digit verification code, stores only its **SHA-256 hash** in `email_codes` with a 10-minute expiry, emails the code via SMTP, and returns a signed **JWT** upon verification.

### 3.1 SMTP Email Sender (`server/src/email.js`)

Works with any transactional SMTP service (Brevo, Resend, Postmark, Mailgun, Amazon SES). In local development (or if SMTP variables are omitted), it logs the 6-digit code to the terminal console so you can test without sending real emails.

```javascript
import nodemailer from "nodemailer";

const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transport = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

const FROM = process.env.MAIL_FROM || "App <no-reply@localhost>";
const TTL = Number(process.env.CODE_TTL_MIN || 10);

export async function sendCode(email, code) {
  if (!transport || process.env.NODE_ENV !== "production") {
    console.log(`[email] verification code for ${email}: ${code}`);
  }
  if (!transport) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[email] SMTP not configured — code was not emailed.");
    }
    return;
  }
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: "Your verification code",
    text: `Your verification code is ${code}. It expires in ${TTL} minutes.`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif">
        <p>Your verification code is:</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
        <p style="color:#555">It expires in ${TTL} minutes. If you didn't request this, you can ignore this email.</p>
      </div>`,
  });
}
```

### 3.2 Auth Routes & JWT Middleware (`server/src/auth.js`)

Includes:
- **Per-IP rate limiting** (`express-rate-limit`: max 30 requests/hour per IP)
- **Per-email rate limiting** (max 5 codes/hour per email address)
- **Brute-force protection** (max 5 verification attempts per code)
- **SHA-256 code hashing** (plain codes are never stored in SQLite)
- **`requireAuth` middleware** for protected API endpoints

```javascript
import express from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db } from "./db.js";
import { sendCode } from "./email.js";

export const authRouter = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const CODE_TTL_MIN = Number(process.env.CODE_TTL_MIN || 10);
const TOKEN_TTL_DAYS = Number(process.env.TOKEN_TTL_DAYS || 365);
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

const emailField = z.string().email().max(200).transform((s) => s.trim().toLowerCase());
const nameField = z.string().trim().min(1).max(60).optional();
const emailSchema = z.object({ email: emailField });
const verifySchema = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/),
  name: nameField,
});

const hashCode = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");
const nowIso = () => new Date().toISOString();

const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// 1. Request a 6-digit code
authRouter.post("/request-code", requestLimiter, async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_email" });
  const { email } = parsed.data;

  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = db
    .prepare("SELECT COUNT(*) AS c FROM email_codes WHERE email = ? AND created_at > ?")
    .get(email, sinceIso).c;
  if (recent >= MAX_CODES_PER_HOUR) return res.status(429).json({ error: "too_many_requests" });

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = Date.now() + CODE_TTL_MIN * 60 * 1000;
  db.prepare(
    "INSERT INTO email_codes (email, code_hash, expires_at, created_at) VALUES (?,?,?,?)"
  ).run(email, hashCode(code), expiresAt, nowIso());

  try {
    await sendCode(email, code);
  } catch (e) {
    console.error("[auth] sendCode failed:", e.message);
    return res.status(502).json({ error: "email_failed" });
  }
  res.json({ ok: true });
});

// 2. Verify the 6-digit code and issue a JWT
authRouter.post("/verify", (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { email, code, name } = parsed.data;

  const row = db
    .prepare("SELECT * FROM email_codes WHERE email = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1")
    .get(email);
  if (!row) return res.status(400).json({ error: "no_code" });
  if (row.attempts >= MAX_ATTEMPTS) return res.status(429).json({ error: "too_many_attempts" });
  if (row.expires_at < Date.now()) return res.status(400).json({ error: "expired" });

  if (row.code_hash !== hashCode(code)) {
    db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return res.status(400).json({ error: "wrong_code" });
  }

  db.prepare("UPDATE email_codes SET consumed_at = ? WHERE id = ?").run(nowIso(), row.id);

  const existing = db.prepare("SELECT email, display_name FROM users WHERE email = ?").get(email);
  const displayName = name || existing?.display_name || null;
  if (existing) {
    db.prepare("UPDATE users SET verified_at = ?, display_name = ? WHERE email = ?").run(nowIso(), displayName, email);
  } else {
    db.prepare("INSERT INTO users (email, display_name, created_at, verified_at) VALUES (?,?,?,?)").run(
      email, displayName, nowIso(), nowIso()
    );
  }

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: `${TOKEN_TTL_DAYS}d` });
  res.json({ token, email, name: displayName });
});

// 3. Express middleware to protect authenticated routes
export function requireAuth(req, res, next) {
  const m = (req.headers.authorization || "").match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "no_token" });
  try {
    req.user = jwt.verify(m[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "bad_token" });
  }
}
```

### 3.3 Express Server Entry Point (`server/src/env.js` & `server/src/index.js`)

Because ES module `import` statements are hoisted before top-level code, load `.env` in a dedicated `env.js` imported first in `index.js`:

**`server/src/env.js`:**
```javascript
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
```

**`server/src/index.js`:**
```javascript
import "./env.js"; // MUST be first import
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", 1); // Required behind Coolify/Traefik reverse proxy for rate limiting
app.use(express.json({ limit: "5mb" }));

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
}

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/auth", authRouter);

// Serve built frontend (sim-app/dist or client/dist) from the same container
const clientDist = path.join(__dirname, "..", "..", "sim-app", "dist");
const clientIndex = path.join(clientDist, "index.html");
if (fs.existsSync(clientIndex)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/admin") return next();
    res.sendFile(clientIndex);
  });
}

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`);
});
```

### 3.4 Frontend Client Integration (React + Vite)

In `vite.config.js`, proxy `/api` and `/admin` to `http://localhost:4000` so frontend code can always use relative `/api/...` URLs in both development and production:

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
    },
  },
});
```

In your React app, store `{ token, email, name }` in `localStorage` and use a 2-step login flow (`idle` -> `code-sent` -> verified):

```javascript
const AUTH_KEY = "app_auth_v1";
const API = "/api";

export function getAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
  catch { return null; }
}
export function setAuth(a) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch {}
}
export function clearAuth() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

export async function apiPost(path, body, token) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "request_failed"), { status: res.status, data });
  return data;
}

// Step 1: Request code
// await apiPost("/auth/request-code", { email: emailInput.trim().toLowerCase() });

// Step 2: Verify code
// const { token, email, name } = await apiPost("/auth/verify", {
//   email: emailInput.trim().toLowerCase(),
//   code: codeInput.trim(),
//   name: nameInput.trim(),
// });
// setAuth({ token, email, name });
```

---

## 4. GitHub Repository Creation & Push Workflow

### 4.1 `.gitignore` (Crucial Security & Cleanliness Rules)

Always create `.gitignore` **before** staging files so `.env` secrets, `node_modules`, and local SQLite `.db` files are never committed:

```gitignore
# Dependencies
node_modules/
**/node_modules/

# Build output
dist/
**/dist/

# Environment variables
.env
.env.local
.env.*.local
**/.env

# SQLite runtime database files
*.db
*.db-shm
*.db-wal

# Logs & OS files
*.log
npm-debug.log*
.DS_Store
Thumbs.db
```

### 4.2 Creating the GitHub Repo & Pushing Code

**Option A: Using GitHub CLI (`gh`)**
```powershell
git init
git branch -M main
git add .
git commit -m "Initial commit"
gh repo create <github-username>/<repo-name> --public --source=. --remote=origin --push
```

**Option B: Using GitHub REST API (Personal Access Token)**
If `gh` CLI is not installed, create the repository via API and push:
```powershell
# 1. Create repo on GitHub
$headers = @{
  Authorization = "Bearer <YOUR_GITHUB_PAT>"
  Accept        = "application/vnd.github+json"
}
$body = @{ name = "<repo-name>"; private = $false } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $body -ContentType "application/json"

# 2. Initialize, commit, and push
git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<github-username>/<repo-name>.git
git push -u origin main
```

---

## 5. Coolify VPS Deployment Guide

### 5.1 Multi-Stage `Dockerfile` (Windows-to-Linux Safe)

Two common pitfalls happen when developing on Windows and deploying to a Linux VPS on Coolify:
1. **`better-sqlite3` native C++ addon**: Requires `python3`, `make`, and `g++` during the Docker build stage.
2. **Vite 8 / Rolldown / LightningCSS optional Linux bindings**: A `package-lock.json` generated on Windows pins Windows-only native binaries (`win32-x64-msvc`) and can cause `Cannot find module @rolldown/binding-linux-x64-gnu` on Linux. Installing frontend dependencies in the builder stage with `--no-package-lock` (without copying the Windows `sim-app/package-lock.json`) guarantees npm fetches the proper Linux native binaries.

Place this `Dockerfile` in the repository root:

```dockerfile
FROM node:22-bookworm-slim AS builder

# Native build toolchain required for better-sqlite3 compilation
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Install backend dependencies
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev

# 2. Install frontend dependencies (skip Windows package-lock.json so Linux native bindings install cleanly)
COPY sim-app/package.json ./sim-app/
RUN npm --prefix sim-app install --include=dev --no-package-lock

# 3. Copy source and remove any host lockfile copied from sim-app
COPY server ./server
COPY sim-app ./sim-app
RUN rm -f sim-app/package-lock.json

ARG SIM_VERSION=2.0.0
ENV SIM_VERSION=${SIM_VERSION}
RUN npm --prefix sim-app run build

# 4. Production runtime image (slim, no compiler toolchain needed at runtime)
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/server ./server
COPY --from=builder /app/sim-app/dist ./sim-app/dist

EXPOSE 4000

CMD ["node", "server/src/index.js"]
```

### 5.2 Configuring the Application in Coolify UI

1. **Create Resource**:
   - In Coolify, open your Project & Environment (e.g., `production`).
   - Click **+ New** -> **Application** -> **Public Repository** (or GitHub App if private).
   - Enter Repository URL: `https://github.com/<username>/<repo-name>`
   - Branch: `main`
   - Build Pack: **Dockerfile** (Dockerfile location: `/Dockerfile`).

2. **Network & Domain Configuration**:
   - **Ports Exposes**: `4000`
   - **Domains**: `https://your-subdomain.yourdomain.com` (Ensure a DNS `A` record points `your-subdomain` to your VPS IP address; Coolify/Traefik automatically provisions the Let's Encrypt SSL certificate).
   - **Healthcheck** (optional): Path `/api/health`, Port `4000`.

3. **Persistent Storage (CRITICAL for SQLite Database on VPS)**:
   - Open the application's **Persistent Storages** tab in Coolify.
   - Add a **Volume Mount**:
     - **Name**: `app-sqlite-data` (or `<app-uuid>-sqlite-data`)
     - **Destination Path (in container)**: `/data`
   - Because the volume is mounted at `/data`, every container rebuild/redeploy preserves `/data/app.db`, `/data/app.db-wal`, and `/data/app.db-shm`.

4. **Environment Variables** (in Coolify -> **Environment Variables** tab):
   Set the following runtime variables (uncheck "Build Variable" unless needed at build time):

   | Variable | Example Value | Purpose |
   | :--- | :--- | :--- |
   | `PORT` | `4000` | Express listening port inside container |
   | `NODE_ENV` | `production` | Enables production behavior |
   | `SQLITE_PATH` | `/data/sim.db` | Must point inside the `/data` persistent volume mount |
   | `JWT_SECRET` | `<64-char-random-hex>` | Signs user login JWTs (`openssl rand -hex 32`) |
   | `ADMIN_KEY` | `<32-char-random-hex>` | Password for `/admin` dashboard & `/api/admin/backup` |
   | `TOKEN_TTL_DAYS` | `365` | How many days user login stays valid |
   | `CODE_TTL_MIN` | `10` | How many minutes a 6-digit email code is valid |
   | `SMTP_HOST` | `smtp-relay.brevo.com` | Your transactional email SMTP host |
   | `SMTP_PORT` | `587` | SMTP port (`587` for STARTTLS, `465` for TLS) |
   | `SMTP_USER` | `your-smtp-login` | SMTP username |
   | `SMTP_PASS` | `your-smtp-password` | SMTP password / API key |
   | `MAIL_FROM` | `"App Name <no-reply@yourdomain.com>"` | Verified sender address in your email provider |

### 5.3 Deploying & Updating via Coolify REST API (For AI Assistant Automation)

When instructing an AI assistant to deploy or update a project on your Coolify VPS automatically, the assistant can use the **Coolify REST API** (`http://<VPS_IP>:8000/api/v1`) with a Coolify API token:

1. **List servers & projects**:
   - `GET /api/v1/servers`
   - `GET /api/v1/projects`
2. **Create a Dockerfile Application from GitHub**:
   - `POST /api/v1/applications/public`
   - Body:
     ```json
     {
       "project_uuid": "<PROJECT_UUID>",
       "server_uuid": "<SERVER_UUID>",
       "environment_name": "production",
       "git_repository": "https://github.com/<username>/<repo-name>",
       "git_branch": "main",
       "build_pack": "dockerfile",
       "ports_exposes": "4000",
       "name": "<app-name>",
       "domains": "https://<subdomain.yourdomain.com>",
       "instant_deploy": false
     }
     ```
3. **Configure Persistent Storage Volume**:
   - Ensure `/data` is mounted in the application's `custom_docker_run_options` (e.g., `-v <app-name>-data:/data`) or via Coolify's persistent storage configuration, and set `SQLITE_PATH=/data/sim.db`.
4. **Add Environment Variables**:
   - `POST /api/v1/applications/<APP_UUID>/envs` (or `/envs/bulk`)
5. **Trigger Deployment & Monitor Logs**:
   - `GET /api/v1/deploy?uuid=<APP_UUID>&force=false`
   - Poll `GET /api/v1/deployments/<DEPLOYMENT_UUID>` until `status` is `"finished"`.
   - Verify live deployment with `GET https://<subdomain.yourdomain.com>/api/health`.

---

## 6. Day-2 Operations Checklist

- **Routine Code Updates**:
  ```powershell
  git add .
  git commit -m "Describe changes"
  git push origin main
  ```
  Then trigger **Deploy** in Coolify (or enable Auto-Deploy webhook).
- **Downloading a Database Backup**:
  - Visit `https://<your-domain>/admin`, enter your `ADMIN_KEY`, and click **Download SQLite Backup**, or run:
    ```powershell
    Invoke-WebRequest -Uri "https://<your-domain>/api/admin/backup" -Headers @{ "x-admin-key" = "<YOUR_ADMIN_KEY>" } -OutFile "backup-$(Get-Date -Format 'yyyyMMdd').db"
    ```
- **Testing Email Login Without Waiting for Inbox**:
  - In Coolify -> Application -> **Logs**, whenever a user requests a code, if `NODE_ENV !== "production"` or when debugging, check `/api/health` and container stdout logs for `[auth]` or `[email]` messages.
