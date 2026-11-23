# Code Templates for Coolify VPS Deploy, Email OTP Auth & SQLite

This reference contains complete, copy-pasteable templates for the `coolify-vps-deploy` skill.

---

## 1. Multi-Stage `Dockerfile` (Root)

Replace `sim-app` with your frontend directory name (e.g., `client` or `sim-app`):

```dockerfile
FROM node:22-bookworm-slim AS builder

# Required to compile better-sqlite3 native addon on Linux
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend dependencies
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev

# Install frontend dependencies (ignore Windows lockfile so Linux native bindings install properly)
COPY sim-app/package.json ./sim-app/
RUN npm --prefix sim-app install --include=dev --no-package-lock

COPY server ./server
COPY sim-app ./sim-app
RUN rm -f sim-app/package-lock.json

ARG SIM_VERSION=2.0.0
ENV SIM_VERSION=${SIM_VERSION}
RUN npm --prefix sim-app run build

# Production runtime image
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/server ./server
COPY --from=builder /app/sim-app/dist ./sim-app/dist

EXPOSE 4000

CMD ["node", "server/src/index.js"]
```

---

## 2. `.gitignore` (Root)

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

---

## 3. Environment Preloader (`server/src/env.js`)

```javascript
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
```

---

## 4. SQLite Database Initialization (`server/src/db.js`)

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
```

---

## 5. SMTP Email Code Sender (`server/src/email.js`)

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

---

## 6. Passwordless Email Code Auth Router (`server/src/auth.js`)

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
const verifySchema = z.object({ email: emailField, code: z.string().regex(/^\d{6}$/), name: nameField });

const hashCode = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");
const nowIso = () => new Date().toISOString();

const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

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

---

## 7. Express Server Entry Point (`server/src/index.js`)

```javascript
import "./env.js"; // must be first import
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", 1); // behind Traefik/Coolify reverse proxy
app.use(express.json({ limit: "5mb" }));

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
}

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/auth", authRouter);

// Serve built frontend bundle when present
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

---

## 8. Coolify REST API Automation Cheat Sheet

Base URL: `http://<VPS_IP>:8000/api/v1`
Header: `Authorization: Bearer <COOLIFY_API_TOKEN>`

1. **Create Public GitHub Dockerfile App**:
   `POST /api/v1/applications/public`
   ```json
   {
     "project_uuid": "<PROJECT_UUID>",
     "server_uuid": "<SERVER_UUID>",
     "environment_name": "production",
     "git_repository": "https://github.com/<user>/<repo>",
     "git_branch": "main",
     "build_pack": "dockerfile",
     "ports_exposes": "4000",
     "name": "<app-name>",
     "domains": "https://<subdomain.domain.com>",
     "custom_docker_run_options": "-v <app-name>-data:/data",
     "instant_deploy": false
   }
   ```
2. **Set Environment Variables**:
   `POST /api/v1/applications/<APP_UUID>/envs` with `{"key": "SQLITE_PATH", "value": "/data/app.db", "is_build_time": false}` (repeat for `JWT_SECRET`, `ADMIN_KEY`, `SMTP_*`, `MAIL_FROM`).
3. **Trigger Deployment**:
   `GET /api/v1/deploy?uuid=<APP_UUID>&force=false`
4. **Check Deployment Status & Logs**:
   `GET /api/v1/deployments/<DEPLOYMENT_UUID>`
