import "./env.js"; // must be the first import — loads .env before other local modules
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./auth.js";
import { runsRouter } from "./runs.js";
import { portfoliosRouter } from "./portfolios.js";
import { researchRunsRouter } from "./researchRuns.js";
import { adminRouter } from "./admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set("trust proxy", 1); // sits behind a reverse proxy (Traefik/nginx) in production
app.use(express.json({ limit: "5mb" }));

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
}

// Admin dashboard (password-gated by ADMIN_KEY, same origin as the API)
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "admin.html")));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use("/api/auth", authRouter);
app.use("/api", runsRouter);
app.use("/api", portfoliosRouter);
app.use("/api", researchRunsRouter);
app.use("/api", adminRouter);

// Serve built frontend (sim-app/dist) when present so a single domain can host both UI + /api + /admin
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
  console.log(
    `[sim-server] listening on 0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV || "development"})`
  );
});
