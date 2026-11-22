/* ============================================================
   Development Map — building shape & 12 subcategory archetypes
   Pure descriptors. Maps each of the 12 public-sector subcategories to a
   distinct, realistic 3D architectural archetype, plus district groupings.
   ============================================================ */

/* Canonical category strings — must match ARC_CATEGORIES in App.jsx exactly. */
export const CATEGORY_KEYS = [
  "Physical Infrastructure & Transport",
  "Social Sectors (Education & Health)",
  "Agriculture, Irrigation & Resources",
];

/* Short labels for legends / tight UI. */
export const CATEGORY_SHORT = {
  "Physical Infrastructure & Transport": "Infrastructure",
  "Social Sectors (Education & Health)": "Social",
  "Agriculture, Irrigation & Resources": "Agriculture",
};

/* 12 Subcategory 3D Archetype Descriptors */
export const SUBCATEGORY_ARCHETYPES = {
  "Paved Roads & Highways": {
    archetype: "highway",
    shortLabel: "Highway Viaduct",
    category: "Physical Infrastructure & Transport",
    footprint: 2.5,
  },
  "Feeder & Rural Roads": {
    archetype: "rural_road",
    shortLabel: "Rural Truss Bridge",
    category: "Physical Infrastructure & Transport",
    footprint: 2.4,
  },
  "Buildings (Administrative)": {
    archetype: "civic_complex",
    shortLabel: "Civic Complex",
    category: "Physical Infrastructure & Transport",
    footprint: 2.3,
  },
  "Large-Scale Dams & Reservoirs": {
    archetype: "dam",
    shortLabel: "Dam & Reservoir",
    category: "Physical Infrastructure & Transport",
    footprint: 2.6,
  },
  "Primary & Secondary Schools": {
    archetype: "school",
    shortLabel: "School Campus",
    category: "Social Sectors (Education & Health)",
    footprint: 2.4,
  },
  "Polytechnic & Technical Schools": {
    archetype: "polytechnic",
    shortLabel: "Polytechnic Tech Lab",
    category: "Social Sectors (Education & Health)",
    footprint: 2.4,
  },
  "General & Tertiary Hospitals": {
    archetype: "hospital",
    shortLabel: "Hospital & Helipad",
    category: "Social Sectors (Education & Health)",
    footprint: 2.5,
  },
  "Rural Health Centers": {
    archetype: "clinic",
    shortLabel: "Rural Health Clinic",
    category: "Social Sectors (Education & Health)",
    footprint: 2.3,
  },
  "Irrigation & Drainage Systems": {
    archetype: "irrigation",
    shortLabel: "Canal & Sluice Gate",
    category: "Agriculture, Irrigation & Resources",
    footprint: 2.5,
  },
  "Agricultural Research & Extension": {
    archetype: "agri_research",
    shortLabel: "Greenhouses & Lab",
    category: "Agriculture, Irrigation & Resources",
    footprint: 2.4,
  },
  "Livestock & Veterinary Services": {
    archetype: "livestock",
    shortLabel: "Barn & Twin Silos",
    category: "Agriculture, Irrigation & Resources",
    footprint: 2.4,
  },
  "Forestry & Watershed Development": {
    archetype: "forestry",
    shortLabel: "Forest & Watchtower",
    category: "Agriculture, Irrigation & Resources",
    footprint: 2.5,
  },
};

/* Legacy category fallback descriptor */
export const CATEGORY_SHAPE = {
  "Physical Infrastructure & Transport": {
    kind: "tower",
    archetype: "civic_complex",
    footprint: 2.3,
    roof: 0,
  },
  "Social Sectors (Education & Health)": {
    kind: "gabled",
    archetype: "school",
    footprint: 2.4,
    roof: 0.9,
  },
  "Agriculture, Irrigation & Resources": {
    kind: "silo",
    archetype: "livestock",
    footprint: 2.4,
    roof: 0.5,
  },
};

export const shapeForProject = (projectOrCategory, subCategory) => {
  const sub = typeof projectOrCategory === "object" ? projectOrCategory?.subCategory : subCategory;
  const cat = typeof projectOrCategory === "object" ? projectOrCategory?.category : projectOrCategory;
  if (sub && SUBCATEGORY_ARCHETYPES[sub]) {
    return SUBCATEGORY_ARCHETYPES[sub];
  }
  return CATEGORY_SHAPE[cat] || SUBCATEGORY_ARCHETYPES["Buildings (Administrative)"];
};

export const shapeForCategory = (category) =>
  CATEGORY_SHAPE[category] || CATEGORY_SHAPE[CATEGORY_KEYS[0]];
