import "./env.js";
import { db } from "./db.js";

const totalUsers = db.prepare("SELECT COUNT(*) c FROM users").get().c;
const totalRuns = db.prepare("SELECT COUNT(*) c FROM runs").get().c;
const totalPortfolios = db.prepare("SELECT COUNT(*) c FROM custom_portfolios").get().c;
const globalPortfolios = db.prepare("SELECT COUNT(*) c FROM custom_portfolios WHERE is_global = 1").get().c;

console.log("=== Portfolio Simulator Usage Report ===");
console.log(`Verified Users    : ${totalUsers}`);
console.log(`Completed Runs    : ${totalRuns}`);
console.log(`Custom Portfolios : ${totalPortfolios} (${globalPortfolios} Global)`);
console.log("");

const byPreset = db
  .prepare(
    `SELECT preset, COUNT(*) runs, ROUND(AVG(score_final),1) avgScore, ROUND(AVG(duration_seconds)/60.0,1) avgMinutes
     FROM runs GROUP BY preset ORDER BY runs DESC`
  )
  .all();
console.log("--- Runs by Mode ---");
console.table(byPreset);

const portfolios = db
  .prepare(
    `SELECT name, owner_email, project_count, total_bac, default_budget, is_global, created_at
     FROM custom_portfolios ORDER BY is_global DESC, created_at DESC LIMIT 15`
  )
  .all();
if (portfolios.length) {
  console.log("--- Custom Portfolios ---");
  console.table(portfolios);
}
