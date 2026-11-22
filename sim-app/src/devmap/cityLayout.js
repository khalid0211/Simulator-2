/* ============================================================
   Development Map — city layout (neighborhoods by category)
   Pure function: given the project list (1..50 projects), places all plots
   into three category "districts" on a stable grid. Automatically scales
   district columns from 4 to 5 when a district has >16 projects so 50-project
   custom portfolios stay balanced and compact.
   ============================================================ */

import { CATEGORY_KEYS } from "./buildingShape.js";

const CELL = 4.4;          // centre-to-centre spacing of plots within a district
const DISTRICT_GAP = 8.5;  // gap between adjacent districts (world units)
const GROUND_PAD = 2.6;    // padding of the tinted district plane around its grid

export const DISTRICT_TINTS = {
  "Physical Infrastructure & Transport": "#7C74A8", // muted violet-grey
  "Social Sectors (Education & Health)": "#5FA1A8", // muted teal
  "Agriculture, Irrigation & Resources": "#9AA36B", // muted olive
};

const tintFor = (category) => DISTRICT_TINTS[category] || "#7C74A8";

function gridDims(count) {
  const maxCols = count > 16 ? 5 : 4;
  const cols = Math.min(Math.max(count, 1), maxCols);
  const rows = Math.max(1, Math.ceil(count / maxCols));
  return { cols, rows };
}

export function computeLayout(projects) {
  const groups = CATEGORY_KEYS.map((category, index) => {
    const members = projects
      .filter((p) => p.category === category)
      .sort((a, b) => a.id.localeCompare(b.id));
    const { cols, rows } = gridDims(members.length);
    return {
      category,
      index,
      members,
      cols,
      rows,
      gridWidth: cols * CELL,
      gridDepth: rows * CELL,
    };
  });

  const totalWidth =
    groups.reduce((a, g) => a + g.gridWidth, 0) +
    DISTRICT_GAP * (groups.length - 1);

  const buildings = [];
  const districts = [];

  let cursorX = -totalWidth / 2;

  for (const g of groups) {
    const districtLeft = cursorX;
    const centerX = districtLeft + g.gridWidth / 2;

    g.members.forEach((p, i) => {
      const col = i % g.cols;
      const row = Math.floor(i / g.cols);
      const x = districtLeft + col * CELL + CELL / 2;
      const z = -g.gridDepth / 2 + row * CELL + CELL / 2;
      buildings.push({
        id: p.id,
        category: g.category,
        subCategory: p.subCategory,
        districtIndex: g.index,
        x,
        z,
      });
    });

    districts.push({
      category: g.category,
      index: g.index,
      centerX,
      centerZ: 0,
      width: g.gridWidth + GROUND_PAD * 2,
      depth: g.gridDepth + GROUND_PAD * 2,
      cols: g.cols,
      rows: g.rows,
      cellSize: CELL,
      tint: tintFor(g.category),
    });

    cursorX += g.gridWidth + DISTRICT_GAP;
  }

  const maxDepth = groups.reduce((a, g) => Math.max(a, g.gridDepth), 0);

  return {
    buildings,
    districts,
    bounds: {
      width: totalWidth + GROUND_PAD * 2,
      depth: maxDepth + GROUND_PAD * 2,
    },
  };
}
