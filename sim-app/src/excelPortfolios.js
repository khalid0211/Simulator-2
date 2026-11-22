/* ============================================================
   Excel (.xlsx) Export, Import, Validation & Template Engine
   Uses SheetJS (`xlsx`) for 12-column round-trip project export/import
   (up to 50 projects) plus multi-sheet full run debrief exports.
   ============================================================ */

import * as XLSX from "xlsx";

export const ARC_CATEGORIES = [
  { category: "Physical Infrastructure & Transport",     subCategory: "Paved Roads & Highways",             arcRate: 0.0500 },
  { category: "Physical Infrastructure & Transport",     subCategory: "Feeder & Rural Roads",               arcRate: 0.1000 },
  { category: "Physical Infrastructure & Transport",     subCategory: "Buildings (Administrative)",         arcRate: 0.0200 },
  { category: "Physical Infrastructure & Transport",     subCategory: "Large-Scale Dams & Reservoirs",       arcRate: 0.0150 },
  { category: "Social Sectors (Education & Health)",     subCategory: "Primary & Secondary Schools",        arcRate: 0.1950 },
  { category: "Social Sectors (Education & Health)",     subCategory: "Polytechnic & Technical Schools",    arcRate: 0.2100 },
  { category: "Social Sectors (Education & Health)",     subCategory: "General & Tertiary Hospitals",       arcRate: 0.2700 },
  { category: "Social Sectors (Education & Health)",     subCategory: "Rural Health Centers",               arcRate: 0.4900 },
  { category: "Agriculture, Irrigation & Resources",     subCategory: "Irrigation & Drainage Systems",      arcRate: 0.0300 },
  { category: "Agriculture, Irrigation & Resources",     subCategory: "Agricultural Research & Extension",  arcRate: 0.0475 },
  { category: "Agriculture, Irrigation & Resources",     subCategory: "Livestock & Veterinary Services",     arcRate: 0.1050 },
  { category: "Agriculture, Irrigation & Resources",     subCategory: "Forestry & Watershed Development",    arcRate: 0.0250 },
];

export const BU_INTENSITY = {
  "Paved Roads & Highways":            0.8,
  "Feeder & Rural Roads":              1.0,
  "Buildings (Administrative)":        0.3,
  "Large-Scale Dams & Reservoirs":     0.6,
  "Primary & Secondary Schools":       1.6,
  "Polytechnic & Technical Schools":   1.4,
  "General & Tertiary Hospitals":      2.0,
  "Rural Health Centers":              1.8,
  "Irrigation & Drainage Systems":     1.1,
  "Agricultural Research & Extension": 0.9,
  "Livestock & Veterinary Services":   0.9,
  "Forestry & Watershed Development":  0.7,
};

export const EXCEL_HEADERS = [
  "Project ID",
  "Title",
  "Category",
  "Subcategory",
  "Initial Budget ($M)",
  "Planned Duration (Months)",
  "Strategic Alignment (%)",
  "Cost Risk (%)",
  "Duration Risk (%)",
  "ARC Rate (%)",
  "Benefit Rate (BU/mo)",
  "Political Mandatory",
];

/**
 * Resolve a raw subcategory string to a canonical ARC_CATEGORIES entry.
 * Returns { entry, matchedExact }.
 */
export function resolveSubCategory(rawSub, rawCat) {
  const s = String(rawSub || "").trim().toLowerCase();
  if (s) {
    // 1. Exact case-insensitive match
    const exact = ARC_CATEGORIES.find((c) => c.subCategory.toLowerCase() === s);
    if (exact) return { entry: exact, matchedExact: true };

    // 2. Substring / keyword match
    const keywordMap = [
      ["highway", "Paved Roads & Highways"],
      ["paved", "Paved Roads & Highways"],
      ["feeder", "Feeder & Rural Roads"],
      ["rural road", "Feeder & Rural Roads"],
      ["building", "Buildings (Administrative)"],
      ["admin", "Buildings (Administrative)"],
      ["civic", "Buildings (Administrative)"],
      ["dam", "Large-Scale Dams & Reservoirs"],
      ["reservoir", "Large-Scale Dams & Reservoirs"],
      ["primary", "Primary & Secondary Schools"],
      ["secondary", "Primary & Secondary Schools"],
      ["school", "Primary & Secondary Schools"],
      ["polytechnic", "Polytechnic & Technical Schools"],
      ["technical", "Polytechnic & Technical Schools"],
      ["vocational", "Polytechnic & Technical Schools"],
      ["hospital", "General & Tertiary Hospitals"],
      ["tertiary", "General & Tertiary Hospitals"],
      ["rural health", "Rural Health Centers"],
      ["clinic", "Rural Health Centers"],
      ["health center", "Rural Health Centers"],
      ["health centre", "Rural Health Centers"],
      ["irrigation", "Irrigation & Drainage Systems"],
      ["drainage", "Irrigation & Drainage Systems"],
      ["canal", "Irrigation & Drainage Systems"],
      ["research", "Agricultural Research & Extension"],
      ["extension", "Agricultural Research & Extension"],
      ["livestock", "Livestock & Veterinary Services"],
      ["veterinary", "Livestock & Veterinary Services"],
      ["forest", "Forestry & Watershed Development"],
      ["watershed", "Forestry & Watershed Development"],
    ];
    for (const [kw, target] of keywordMap) {
      if (s.includes(kw)) {
        const found = ARC_CATEGORIES.find((c) => c.subCategory === target);
        if (found) return { entry: found, matchedExact: true };
      }
    }
  }

  // 3. Fallback by category if provided
  const catStr = String(rawCat || "").trim().toLowerCase();
  if (catStr) {
    const byCat = ARC_CATEGORIES.find((c) => c.category.toLowerCase().includes(catStr));
    if (byCat) return { entry: byCat, matchedExact: false };
  }

  return { entry: ARC_CATEGORIES[2], matchedExact: false }; // Buildings (Administrative) default
}

function parseNumber(val, fallback) {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (val == null || val === "") return fallback;
  const cleaned = String(val).replace(/[$,%mM\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function parsePercentToFraction(val, fallbackFraction, minFrac = 0, maxFrac = 1) {
  if (val == null || val === "") return fallbackFraction;
  const n = parseNumber(val, NaN);
  if (!Number.isFinite(n)) return fallbackFraction;
  const frac = n > 1 ? n / 100 : n;
  return Math.min(maxFrac, Math.max(minFrac, frac));
}

function parseBool(val) {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  const s = String(val || "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "y" || s === "mandatory";
}

export function computeDefaultBuRate(bacInitial, subCategory, costRisk, durRisk) {
  const intensity = BU_INTENSITY[subCategory] || 1.0;
  return +(bacInitial * intensity * (1 + (costRisk || 0) + (durRisk || 0))).toFixed(2);
}

/**
 * Convert an array of Project objects into the 12-column baseline rows for SheetJS.
 */
export function projectsToBaselineRows(projects) {
  return projects.map((p, idx) => {
    const costRiskBase = p.costRiskBase ?? p.costRisk ?? 0.1;
    const durRiskBase = p.durRiskBase ?? p.durRisk ?? 0.1;
    const buRate = p.buRate || computeDefaultBuRate(p.bacInitial, p.subCategory, costRiskBase, durRiskBase);
    return {
      "Project ID": p.id || "P" + String(idx + 1).padStart(2, "0"),
      "Title": p.title || `Project P${String(idx + 1).padStart(2, "0")}`,
      "Category": p.category,
      "Subcategory": p.subCategory,
      "Initial Budget ($M)": +Number(p.bacInitial || 5).toFixed(2),
      "Planned Duration (Months)": Math.round(p.durationPlanned || 18),
      "Strategic Alignment (%)": +((p.alignment ?? 0.5) * 100).toFixed(1),
      "Cost Risk (%)": +(costRiskBase * 100).toFixed(1),
      "Duration Risk (%)": +(durRiskBase * 100).toFixed(1),
      "ARC Rate (%)": +((p.arcRate ?? 0.05) * 100).toFixed(2),
      "Benefit Rate (BU/mo)": +Number(buRate).toFixed(2),
      "Political Mandatory": p.political ? "TRUE" : "FALSE",
    };
  });
}

function setSheetColWidths(ws, widths) {
  ws["!cols"] = widths.map((wch) => ({ wch }));
}

/**
 * Export projects (and if `sim` is an active or completed run, additional outcome sheets)
 * directly to an `.xlsx` file download.
 */
export function exportPortfolioToExcel(simOrProjects, filename = "portfolio-projects.xlsx") {
  const isSim = simOrProjects && Array.isArray(simOrProjects.projects);
  const projects = isSim ? simOrProjects.projects : simOrProjects;
  const wb = XLSX.utils.book_new();

  // Sheet 1: Projects_Baseline (12-column round-trip importable format)
  const baselineRows = projectsToBaselineRows(projects);
  const wsBaseline = XLSX.utils.json_to_sheet(baselineRows, { header: EXCEL_HEADERS });
  setSheetColWidths(wsBaseline, [12, 36, 36, 32, 20, 24, 22, 16, 16, 15, 20, 18]);
  XLSX.utils.book_append_sheet(wb, wsBaseline, "Projects_Baseline");

  if (isSim) {
    const sim = simOrProjects;

    // Sheet 2: Run_Outcomes
    const outcomeRows = sim.projects.map((p) => ({
      "Project ID": p.id,
      "Title": p.title,
      "Category": p.category,
      "Subcategory": p.subCategory,
      "Final State": p.state,
      "Start Month": p.startMonth ?? "—",
      "Completion Month": p.completionMonth ?? "—",
      "Initial BAC ($M)": +Number(p.bacInitial || 0).toFixed(2),
      "Locked/Current BAC ($M)": +Number(p.bacCurrent || 0).toFixed(2),
      "Nominal Spent ($M)": +Number(p.nominalSpent || 0).toFixed(2),
      "Real Cash Drawn ($M)": +Number(p.cashDrawn || 0).toFixed(2),
      "Planned Duration (mo)": p.durationPlanned,
      "Current/Final Duration (mo)": p.durationCurrent ?? p.durationPlanned,
      "Strategic Alignment (%)": +((p.alignment || 0) * 100).toFixed(1),
      "Milestones Triggered": (p.milestones || []).join(", ") || "None",
      "ARC Reduced": p.arcReduced ? "Yes" : "No",
      "ARC Reductions Count": p.arcReductionCount || 0,
      "ARC Backlog ($M)": +Number(p.arcBacklog || 0).toFixed(3),
      "Cumulative Benefits (BU)": +Number(p.buCumulative || 0).toFixed(2),
    }));
    const wsOutcomes = XLSX.utils.json_to_sheet(outcomeRows);
    setSheetColWidths(wsOutcomes, [12, 34, 32, 28, 14, 12, 16, 16, 22, 18, 20, 20, 22, 20, 18, 14, 18, 16, 22]);
    XLSX.utils.book_append_sheet(wb, wsOutcomes, "Run_Outcomes");

    // Sheet 3: Monthly_Cash_Flow
    if (Array.isArray(sim.history) && sim.history.length > 0) {
      const freq = sim.config?.fundingFrequency ?? 3;
      const cfRows = sim.history.map((h) => {
        const m = h.month;
        const release = (m - 1) % freq === 0 ? (sim.releaseSchedule?.[(m - 1) / freq] ?? 0) : 0;
        return {
          "Month": m,
          "Funding Release ($M)": +Number(release).toFixed(3),
          "Capex Demand ($M)": +Number(h.demand || 0).toFixed(3),
          "ARC Spent ($M)": +Number(h.arc || 0).toFixed(3),
          "Total Spent ($M)": +Number((h.demand || 0) + (h.arc || 0)).toFixed(3),
          "Ending Available Balance ($M)": +Number(h.balanceAfter || 0).toFixed(3),
        };
      });
      const wsCf = XLSX.utils.json_to_sheet(cfRows);
      setSheetColWidths(wsCf, [10, 22, 20, 18, 18, 26]);
      XLSX.utils.book_append_sheet(wb, wsCf, "Monthly_Cash_Flow");
    }

    // Sheet 4: Decisions_Log
    if (Array.isArray(sim.decisions) && sim.decisions.length > 0) {
      const decRows = sim.decisions.map((d, i) => ({
        "#": i + 1,
        "Month": d.month,
        "Action": d.type,
        "Project ID": d.id,
        "Project Title": d.title,
        "Parameter (%)": d.s ? +(d.s * 100).toFixed(0) : d.a ? +(d.a * 100).toFixed(0) : "",
      }));
      const wsDec = XLSX.utils.json_to_sheet(decRows);
      setSheetColWidths(wsDec, [6, 10, 14, 12, 36, 16]);
      XLSX.utils.book_append_sheet(wb, wsDec, "Decisions_Log");
    }
  }

  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Parse an uploaded `.xlsx` / `.xls` / `.csv` ArrayBuffer into validated project template objects (1..50).
 * Returns { projects, warnings, truncated }.
 */
export function parsePortfolioExcelBuffer(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The workbook contains no sheets.");
  const ws = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rawRows.length) throw new Error("The spreadsheet is empty.");

  const warnings = [];
  const truncated = rawRows.length > 50;
  if (truncated) {
    warnings.push(`File contained ${rawRows.length} rows; trimmed to the maximum of 50 projects.`);
  }
  const slice = rawRows.slice(0, 50);

  // Flexible column lookup helper (case-insensitive, partial header match)
  const getCol = (row, candidates) => {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const exact = keys.find((k) => k.trim().toLowerCase() === cand.toLowerCase());
      if (exact !== undefined && row[exact] !== "") return row[exact];
    }
    for (const cand of candidates) {
      const partial = keys.find((k) => k.trim().toLowerCase().includes(cand.toLowerCase()));
      if (partial !== undefined && row[partial] !== "") return row[partial];
    }
    return "";
  };

  const projects = slice.map((row, idx) => {
    const id = "P" + String(idx + 1).padStart(2, "0");
    const rawTitle = String(getCol(row, ["Title", "Project Title", "Name", "Project Name"]) || "").trim();
    const title = rawTitle || `Custom Project ${id}`;
    const rawSub = getCol(row, ["Subcategory", "Sub-category", "SubCategory", "Type"]);
    const rawCat = getCol(row, ["Category", "Sector"]);
    const { entry: catEntry, matchedExact } = resolveSubCategory(rawSub, rawCat);

    const rawBac = getCol(row, ["Initial Budget ($M)", "Initial Budget", "BAC", "Budget ($M)", "Budget"]);
    const bacNum = parseNumber(rawBac, 6.0);
    const bacInitial = +Math.min(500, Math.max(0.1, bacNum)).toFixed(2);

    const rawDur = getCol(row, ["Planned Duration (Months)", "Planned Duration", "Duration (Months)", "Duration"]);
    const durNum = Math.round(parseNumber(rawDur, 18));
    const durationPlanned = Math.min(60, Math.max(1, durNum));

    const rawAlign = getCol(row, ["Strategic Alignment (%)", "Strategic Alignment", "Alignment (%)", "Alignment"]);
    const alignment = +parsePercentToFraction(rawAlign, 0.65, 0.01, 1.0).toFixed(2);

    const rawCostRisk = getCol(row, ["Cost Risk (%)", "Cost Risk", "CostRisk"]);
    const costRiskBase = +parsePercentToFraction(rawCostRisk, 0.10, 0.0, 0.40).toFixed(3);

    const rawDurRisk = getCol(row, ["Duration Risk (%)", "Duration Risk", "DurRisk", "Schedule Risk"]);
    const durRiskBase = +parsePercentToFraction(rawDurRisk, 0.10, 0.0, 0.40).toFixed(3);

    const rawArc = getCol(row, ["ARC Rate (%)", "ARC Rate", "ARC (%)"]);
    const arcRate =
      rawArc === "" || rawArc == null
        ? catEntry.arcRate
        : +parsePercentToFraction(rawArc, catEntry.arcRate, 0.0, 1.0).toFixed(4);

    const rawBu = getCol(row, ["Benefit Rate (BU/mo)", "Benefit Rate", "BU/mo", "Benefit Units"]);
    const parsedBu = parseNumber(rawBu, 0);
    const buRate =
      parsedBu > 0
        ? +parsedBu.toFixed(2)
        : computeDefaultBuRate(bacInitial, catEntry.subCategory, costRiskBase, durRiskBase);

    const rawPol = getCol(row, ["Political Mandatory", "Political", "Mandatory"]);
    const political = parseBool(rawPol);

    const rowWarnings = [];
    if (!rawTitle) rowWarnings.push("Missing title");
    if (!matchedExact) rowWarnings.push("Subcategory defaulted");

    return {
      id,
      title: title.slice(0, 120),
      category: catEntry.category,
      subCategory: catEntry.subCategory,
      arcRate,
      bacInitial,
      alignment,
      durationPlanned,
      costRiskBase,
      durRiskBase,
      costRisk: costRiskBase,
      durRisk: durRiskBase,
      buRate,
      political,
      _warnings: rowWarnings,
    };
  });

  return { projects, warnings, truncated };
}
