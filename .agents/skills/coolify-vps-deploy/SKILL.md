---
name: coolify-vps-deploy
description: >-
  End-to-end runbook for building and deploying a full-stack Node/Express + Vite/React
  application to a VPS using Coolify and GitHub, complete with passwordless 6-digit
  email OTP authentication (JWT) and a persistent SQLite database (better-sqlite3 in WAL mode)
  stored on a Coolify persistent volume. Use this skill whenever the user asks to set up
  email code login, a VPS database, a GitHub repo push, or a Coolify VPS deployment.
---

# Coolify VPS Deployment, Email OTP Auth & Persistent SQLite Skill

Use this skill to scaffold, configure, or deploy full-stack applications following the proven **Simulator-2** architecture:
- **Single-container monorepo**: Express backend (`server/`) + Vite React frontend (`client/` or `sim-app/`) served together from one container on port `4000`.
- **Passwordless Email Code (OTP) Login**: 6-digit verification code sent via SMTP (or logged to console in dev), hashed with SHA-256 in SQLite, issuing a long-lived JWT.
- **Persistent VPS Database**: `better-sqlite3` in WAL mode stored on a Coolify Persistent Volume (`/data/<app>.db`) with an authenticated `/api/admin/backup` hot-backup endpoint.
- **GitHub + Coolify Deployment**: Multi-stage Linux-compatible `Dockerfile` (handling `better-sqlite3` C++ build tools and avoiding Windows `package-lock.json` native binding failures) deployed via Coolify UI or Coolify REST API.

For complete copy-pasteable source files (`db.js`, `auth.js`, `email.js`, `env.js`, `index.js`, `Dockerfile`, and frontend auth helpers), read [references/code-templates.md](./references/code-templates.md).

---

## Step 1: Structure the Monorepo & Environment Preloader

1. Separate the project into `server/` (Express API + SQLite) and `client/` or `sim-app/` (Vite + React).
2. In `server/src/env.js`, load `dotenv` before any other module is imported so top-level `process.env` reads in `auth.js`, `db.js`, and `email.js` always see `.env` values.
3. In `server/src/index.js`:
   - Import `./env.js` on line 1.
   - Set `app.set("trust proxy", 1)` so `express-rate-limit` reads real client IPs behind Coolify's Traefik reverse proxy.
   - Mount `/api/health`, `/api/auth`, and your domain routers.
   - Serve the built frontend (`../<client>/dist`) as static files with an SPA fallback to `index.html` for non-`/api` routes.
   - Listen on `0.0.0.0:${process.env.PORT || 4000}`.
4. In the frontend's `vite.config.js`, configure `server.proxy` to forward `/api` and `/admin` to `http://localhost:4000` so the frontend always uses relative `/api/...` paths in both development and production.

---

## Step 2: Set Up the Persistent SQLite Database (`better-sqlite3`)

1. Install `better-sqlite3` in `server/`.
2. In `server/src/db.js`:
   - Resolve `dbPath` from `process.env.SQLITE_PATH` (used on VPS: `/data/app.db`) with fallback to `./data/app.db` for local dev.
   - Call `fs.mkdirSync(path.dirname(dbPath), { recursive: true })` before opening the database.
   - Set `db.pragma("journal_mode = WAL")` and `db.pragma("foreign_keys = ON")`.
   - Run `CREATE TABLE IF NOT EXISTS` for `users`, `email_codes`, and application tables.
   - Use `try { db.exec("ALTER TABLE ... ADD COLUMN ..."); } catch {}` for safe additive migrations across deploys.
3. Add a hot-backup route (`GET /api/admin/backup` gated by `x-admin-key === process.env.ADMIN_KEY`) using `await db.backup(tmpFile)` so a consistent single-file `.db` snapshot can be downloaded anytime over HTTP.

---

## Step 3: Implement Passwordless Email Code (OTP) Authentication

1. **Database Tables**:
   - `users (email TEXT PRIMARY KEY, display_name TEXT, created_at TEXT NOT NULL, verified_at TEXT)`
   - `email_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed_at TEXT, created_at TEXT NOT NULL)`
2. **SMTP Sender (`server/src/email.js`)**:
   - Configure `nodemailer` using `SMTP_HOST`, `SMTP_PORT` (`587` STARTTLS or `465` TLS), `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`.
   - When `NODE_ENV !== "production"` or SMTP is not configured, log `[email] verification code for ${email}: ${code}` to stdout so local testing works without an inbox.
3. **Auth Endpoints (`server/src/auth.js`)**:
   - `POST /api/auth/request-code`:
     - Validate & normalize email (`trim().toLowerCase()`).
     - Enforce per-IP rate limit (30/hr) and per-email throttle (max 5 codes/hr in `email_codes`).
     - Generate a 6-digit code via `crypto.randomInt(0, 1_000_000)`, store its SHA-256 hash (`code_hash`) with `expires_at = Date.now() + CODE_TTL_MIN * 60 * 1000`, and call `sendCode(email, code)`.
   - `POST /api/auth/verify`:
     - Look up the latest unconsumed code for `email`.
     - Reject if missing (`no_code`), `attempts >= 5` (`too_many_attempts`), expired (`expired`), or hash mismatch (increment `attempts` and return `wrong_code`).
     - Mark `consumed_at`, upsert `users` with `display_name`, and return `{ token, email, name }` signed with `jwt.sign({ email }, JWT_SECRET, { expiresIn: "${TOKEN_TTL_DAYS}d" })`.
   - `requireAuth` middleware: Verify `Authorization: Bearer <token>` and attach `req.user`.

---

## Step 4: Prepare `.gitignore` and Push to GitHub

1. Create `.gitignore` at the repository root **before** staging files:
   - Ignore `node_modules/`, `**/node_modules/`, `dist/`, `**/dist/`
   - Ignore `.env`, `.env.*`, `**/.env`
   - Ignore `*.db`, `*.db-shm`, `*.db-wal`
2. Initialize Git (`git init && git branch -M main`), commit, create the GitHub repository via `gh repo create` or `POST https://api.github.com/user/repos`, and push `origin main`.

---

## Step 5: Build the Multi-Stage `Dockerfile` (Windows-to-Linux Safe)

Always include these two critical fixes in the root `Dockerfile`:
1. **Install C++ build tools** (`python3 make g++`) in the `node:22-bookworm-slim` builder stage so `better-sqlite3` compiles cleanly when prebuilds aren't available.
2. **Avoid Windows lockfile native binding errors on Linux**: When developing on Windows, `package-lock.json` in the Vite frontend pins Windows native binaries (`@rolldown/binding-win32-x64-msvc` / `lightningcss-win32-x64-msvc`) and causes `Cannot find module @rolldown/binding-linux-x64-gnu` inside Linux Docker builds. Fix this in the Dockerfile by copying only `<client>/package.json` and running `npm --prefix <client> install --include=dev --no-package-lock`, and removing `<client>/package-lock.json` after copying source files.

See [references/code-templates.md](./references/code-templates.md) for the exact `Dockerfile`.

---

## Step 6: Deploy to VPS with Coolify (UI or REST API)

1. **Create Dockerfile Application** in Coolify pointing to the GitHub repository (`main` branch, `/Dockerfile`, exposed port `4000`).
2. **Mount Persistent Volume for SQLite**:
   - Mount a persistent volume to container destination path `/data` (e.g., volume `<app>-sqlite-data` -> `/data`).
   - Set environment variable `SQLITE_PATH=/data/app.db`.
3. **Configure Environment Variables**:
   - `PORT=4000`
   - `NODE_ENV=production`
   - `SQLITE_PATH=/data/app.db`
   - `JWT_SECRET=<64-char-hex>`
   - `ADMIN_KEY=<32-char-hex>`
   - `TOKEN_TTL_DAYS=365`
   - `CODE_TTL_MIN=10`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
4. **Assign Domain & HTTPS**:
   - Set the domain in Coolify (`https://app.yourdomain.com`) with a DNS `A` record pointing to the VPS IP.
5. **Verify Deployment**:
   - Confirm `GET https://app.yourdomain.com/api/health` returns `{"ok":true,...}`.
   - Test requesting a verification code and verifying persistence across a container redeploy.
