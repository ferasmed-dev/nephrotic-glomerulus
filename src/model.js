// Glomérulo nefrótico interactivo: pure model (no DOM).
// Every entity that causes the nephrotic syndrome is described by structured
// data (lesion, deposits, immunofluorescence, typical labs, barrier damage),
// plus three small models: a size/charge sieve of the filtration barrier,
// the response of podocytopathies to treatment, and the course of anti-PLA2R
// and proteinuria in membranous nephropathy. Text lives in i18n.js; this file
// only holds data and functions, so it can be tested in Node.

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------------------
// Parameters and normal ranges
// ---------------------------------------------------------------------------
// kind: 'quant' = number with a normal band; 'index' = serology as value /
// assay cut-off (>= 1 positive); 'qual' = absent (0) / present (1);
// 'ord' = 0-3 crosses; 'sel' = selectivity index (special classes).
export const PARAMS = [
  // Urine
  { key: 'hematuria', group: 'urine', kind: 'quant', lo: 0, hi: 3, min: 0, max: 60 },
  // <= 3 red cells per high-power field (standard sediment cut-off)
  { key: 'lipiduria', group: 'urine', kind: 'qual' },
  // oval fat bodies / fatty casts with Maltese crosses under polarised light
  { key: 'upcr', group: 'urine', kind: 'quant', lo: 0, hi: 0.15, min: 0, max: 15, mark: 3.5 },
  // urine protein/creatinine ratio, g/g (≈ g/24 h in an adult). Normal < 0.15;
  // nephrotic range >= 3.5 g/g in adults and >= 2 g/g in children (KDIGO 2021/2025).
  { key: 'selectivity', group: 'urine', kind: 'sel', min: 0, max: 0.8 },
  // clearance IgG / clearance transferrin: <= 0.1 selective, > 0.2 non-selective
  // Kidney
  { key: 'egfr', group: 'kidney', kind: 'quant', lo: 90, hi: Infinity, min: 0, max: 130 },
  // KDIGO G1 >= 90 mL/min/1.73 m²
  // Blood
  { key: 'albumin', group: 'blood', kind: 'quant', lo: 3.5, hi: 5.0, min: 0, max: 5.5, mark: 2.5 },
  // g/dL. < 2.5 g/dL marks the zone where thrombotic risk rises steeply (KDIGO 2021, MN)
  { key: 'chol', group: 'blood', kind: 'quant', lo: 0, hi: 200, min: 0, max: 500 },
  { key: 'tg', group: 'blood', kind: 'quant', lo: 0, hi: 150, min: 0, max: 500 },
  { key: 'atiii', group: 'blood', kind: 'quant', lo: 80, hi: 120, min: 0, max: 140 },
  // antithrombin activity, % (lost in the urine: it is about the size of albumin)
  { key: 'igg', group: 'blood', kind: 'quant', lo: 700, hi: 1600, min: 0, max: 1800 },
  // Clinical
  { key: 'edema', group: 'clinical', kind: 'ord' },
  { key: 'sbp', group: 'clinical', kind: 'quant', lo: 90, hi: 129, min: 70, max: 190 },
  // Complement
  { key: 'c3', group: 'complement', kind: 'quant', lo: 90, hi: 180, min: 0, max: 220 },
  { key: 'c4', group: 'complement', kind: 'quant', lo: 10, hi: 40, min: 0, max: 50 },
  // Etiology
  { key: 'pla2r', group: 'etiology', kind: 'quant', lo: 0, hi: 13.9, min: 0, max: 300, mark: 50 },
  // RU/mL, ELISA: < 14 negative; > 50 = high-risk marker (KDIGO 2021)
  { key: 'ana', group: 'etiology', kind: 'index' },
  { key: 'hbsag', group: 'etiology', kind: 'qual' },
  { key: 'hcv', group: 'etiology', kind: 'qual' },
  { key: 'hiv', group: 'etiology', kind: 'qual' },
  { key: 'cryo', group: 'etiology', kind: 'qual' },
  { key: 'c3nef', group: 'etiology', kind: 'qual' },
  { key: 'mspike', group: 'etiology', kind: 'qual' },
  // monoclonal component / abnormal free light-chain ratio
  { key: 'hba1c', group: 'etiology', kind: 'quant', lo: 4, hi: 5.6, min: 3, max: 12 },
];

export const PARAM_GROUPS = ['urine', 'kidney', 'blood', 'clinical', 'complement', 'etiology'];
export const paramByKey = Object.fromEntries(PARAMS.map((p) => [p.key, p]));
export const INDEX_MAX = 10;

/** Nephrotic-range cut-off of the protein/creatinine ratio (g/g). */
export const nephroticCut = (age = 'adult') => (age === 'child' ? 2 : 3.5);

/** Normal range for a parameter; children get their own UPCR and systolic limits. */
export function normalRange(key, age = 'adult') {
  const p = paramByKey[key];
  if (!p) throw new Error(`unknown parameter ${key}`);
  if (key === 'sbp' && age === 'child') return { lo: 85, hi: 114 };
  // ~95th percentile systolic for a school-age child of average height (Modelo)
  if (key === 'upcr' && age === 'child') return { lo: 0, hi: 0.2 };
  // children over 2 years: < 0.2 g/g
  if (p.kind === 'index') return { lo: 0, hi: 0.99 };
  if (p.kind === 'qual' || p.kind === 'ord') return { lo: 0, hi: 0 };
  if (p.kind === 'sel') return { lo: 0, hi: 0.1 };
  return { lo: p.lo, hi: p.hi };
}

/**
 * 'low' | 'normal' | 'high' (quant/ord), 'neg' | 'pos' (index/qual),
 * 'sel' | 'mid' | 'nonsel' (selectivity index).
 */
export function status(key, value, age = 'adult') {
  const p = paramByKey[key];
  const { lo, hi } = normalRange(key, age);
  if (p.kind === 'index') return value >= 1 ? 'pos' : 'neg';
  if (p.kind === 'qual') return value >= 0.5 ? 'pos' : 'neg';
  if (p.kind === 'ord') return Math.round(value) > hi ? 'high' : 'normal';
  if (p.kind === 'sel') return value <= 0.1 ? 'sel' : value <= 0.2 ? 'mid' : 'nonsel';
  if (value < lo) return 'low';
  if (value > hi) return 'high';
  return 'normal';
}

export const isAbnormal = (key, value, age) => !['normal', 'neg', 'sel'].includes(status(key, value, age));

const NORMAL_TYPICAL = {
  hematuria: [0, 2], lipiduria: [0, 0], upcr: [0.05, 0.12],
  egfr: [95, 115], albumin: [4.0, 4.6], chol: [160, 190], tg: [80, 130], atiii: [90, 110], igg: [900, 1300],
  edema: [0, 0], sbp: [110, 124], c3: [110, 150], c4: [20, 32],
  pla2r: [1, 5], ana: [0.1, 0.5], hbsag: [0, 0], hcv: [0, 0], hiv: [0, 0], cryo: [0, 0], c3nef: [0, 0], mspike: [0, 0],
  hba1c: [4.8, 5.4],
};
const CHILD_SBP = [96, 108];

// ---------------------------------------------------------------------------
// Filtration barrier: size + charge sieve (Modelo)
// ---------------------------------------------------------------------------
// Two pathways in parallel:
//  - the normal restrictive pathway: logistic size cut-off (50 % at 3.0 nm)
//    times a charge penalty exp(-Q·z·(1 - chargeLoss)) for anionic proteins;
//  - a non-selective "shunt" of large defects, (1 - r/11)², whose fraction
//    grows when the GBM/podocyte layer is structurally damaged.
// Calibrated so that the normal sieving coefficient of albumin is ~6·10⁻⁴.
export const PROTEINS = {
  b2m: { mw: 11.8, radius: 1.6, z: 0.3, plasma: 0.002 },
  albumin: { mw: 66.5, radius: 3.6, z: 1, plasma: 40 },
  transferrin: { mw: 79.5, radius: 4.0, z: 0.6, plasma: 2.5 },
  igg: { mw: 150, radius: 5.3, z: 0.1, plasma: 10 },
};
// radius: Stokes radius, nm; z: relative anionic charge (0-1); plasma: g/L
export const PROTEIN_IDS = Object.keys(PROTEINS);
export const SIEVE = { r50: 3.0, width: 0.18, Q: 4, shuntRadius: 11 };
export const NORMAL_BARRIER = { chargeLoss: 0, shunt: 1e-5 };

export function sieving(proteinId, barrier = NORMAL_BARRIER) {
  const p = PROTEINS[proteinId];
  const size = 1 / (1 + Math.exp((p.radius - SIEVE.r50) / SIEVE.width));
  const charge = Math.exp(-SIEVE.Q * p.z * (1 - clamp(barrier.chargeLoss, 0, 1)));
  const shunt = clamp(barrier.shunt, 0, 1);
  const big = (1 - Math.min(1, p.radius / SIEVE.shuntRadius)) ** 2;
  return (1 - shunt) * size * charge + shunt * big;
}

/** Clearance IgG / clearance transferrin: the classic selectivity index. */
export function selectivityIndex(barrier) {
  return sieving('igg', barrier) / sieving('transferrin', barrier);
}

/** Share (%) of each protein in the filtered protein mass (before tubular reabsorption). */
export function filtrateComposition(barrier) {
  const mass = Object.fromEntries(PROTEIN_IDS.map((id) => [id, sieving(id, barrier) * PROTEINS[id].plasma]));
  const tot = Object.values(mass).reduce((a, b) => a + b, 0);
  return Object.fromEntries(PROTEIN_IDS.map((id) => [id, (100 * mass[id]) / tot]));
}

export const selectivityClass = (si) => (si <= 0.1 ? 'sel' : si <= 0.2 ? 'mid' : 'nonsel');

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
// group: tree branch. labs: [lo, hi] typical range at presentation.
// barrier: chargeLoss (0-1) and shunt fraction for the sieve model.
// visual: layers drawn on the glomerulus, the barrier and the 3D loop.
// if: immunofluorescence pattern + reactants (0-3).
// clinical: age group, typical age, signs.
// keys: compact facts used by Compare (values are i18n keys).
// course: which time model applies.
export const ENTITIES = {
  // --- Podocytopathies ------------------------------------------------------
  mcd: {
    group: 'podocyte',
    labs: { lipiduria: [1, 1], upcr: [7, 11], egfr: [100, 125], albumin: [1.2, 1.9], chol: [320, 450], tg: [200, 320], atiii: [50, 65], igg: [200, 400], edema: [3, 3], sbp: CHILD_SBP },
    barrier: { chargeLoss: 0.8, shunt: 4e-4 },
    visual: { circulating: 'factor', effacement: 'diffuse' },
    if: { pattern: 'negative', reactants: {} },
    clinical: { age: 'child', years: [2, 8], signs: ['periorbital'] },
    keys: { hematuria: 'rare', complement: 'normal', steroids: 'excellent', thrombosis: 'moderate', biopsy: 'notChild', prognosis: 'good', lm: 'normal', em: 'diffuseEffacement' },
    course: 'steroids',
  },
  fsgsPrimary: {
    group: 'podocyte',
    labs: { hematuria: [5, 15], lipiduria: [1, 1], upcr: [7, 11], egfr: [60, 80], albumin: [1.8, 2.5], chol: [300, 420], tg: [180, 300], atiii: [55, 70], igg: [400, 600], edema: [2, 3], sbp: [135, 148] },
    barrier: { chargeLoss: 0.6, shunt: 0.004 },
    visual: { circulating: 'factor', effacement: 'diffuse', sclerosis: true },
    if: { pattern: 'segmentalIgM', reactants: { IgM: 2, C3: 1 } },
    clinical: { age: 'adult', years: [25, 50], signs: [] },
    keys: { hematuria: 'frequent', complement: 'normal', steroids: 'partial', thrombosis: 'moderate', biopsy: 'yes', prognosis: 'progressive', lm: 'segmentalSclerosis', em: 'diffuseEffacement' },
    course: 'steroids',
  },
  fsgsGenetic: {
    group: 'podocyte',
    labs: { hematuria: [3, 10], lipiduria: [1, 1], upcr: [4, 7], egfr: [65, 85], albumin: [2.0, 2.7], chol: [260, 360], tg: [160, 260], atiii: [60, 75], igg: [450, 650], edema: [2, 2], sbp: [112, 122] },
    barrier: { chargeLoss: 0.5, shunt: 0.003 },
    visual: { circulating: 'genetic', effacement: 'diffuse', sclerosis: true },
    if: { pattern: 'segmentalIgM', reactants: { IgM: 1, C3: 1 } },
    clinical: { age: 'child', years: [3, 12], signs: ['family', 'steroidResistant'] },
    keys: { hematuria: 'frequent', complement: 'normal', steroids: 'none', thrombosis: 'moderate', biopsy: 'yesGenetic', prognosis: 'progressive', lm: 'segmentalSclerosis', em: 'diffuseEffacement' },
    course: 'steroids',
  },
  fsgsAdaptive: {
    group: 'podocyte',
    labs: { hematuria: [0, 3], upcr: [3.8, 6], egfr: [55, 75], albumin: [3.6, 4.1], chol: [180, 230], tg: [150, 230], atiii: [85, 105], igg: [800, 1100], edema: [0, 0], sbp: [142, 158] },
    barrier: { chargeLoss: 0.25, shunt: 0.003 },
    visual: { circulating: 'hyperfiltration', effacement: 'segmental', sclerosis: 'perihilar', bigGlom: true },
    if: { pattern: 'segmentalIgM', reactants: { IgM: 1, C3: 1 } },
    clinical: { age: 'adult', years: [35, 60], signs: ['obesity'] },
    keys: { hematuria: 'rare', complement: 'normal', steroids: 'notIndicated', thrombosis: 'low', biopsy: 'yes', prognosis: 'slow', lm: 'perihilarSclerosis', em: 'segmentalEffacement' },
    course: 'raas',
  },
  fsgsCollapsing: {
    group: 'podocyte',
    labs: { hematuria: [2, 8], lipiduria: [1, 1], upcr: [9, 14], egfr: [25, 45], albumin: [1.6, 2.2], chol: [280, 380], tg: [180, 280], atiii: [50, 65], igg: [1000, 1400], edema: [2, 3], sbp: [116, 128], hiv: [1, 1] },
    barrier: { chargeLoss: 0.6, shunt: 0.008 },
    visual: { circulating: 'hiv', effacement: 'diffuse', collapse: true },
    if: { pattern: 'segmentalIgM', reactants: { IgM: 1, C3: 1 } },
    clinical: { age: 'adult', years: [25, 50], signs: [] },
    keys: { hematuria: 'frequent', complement: 'normal', steroids: 'notIndicated', thrombosis: 'moderate', biopsy: 'yes', prognosis: 'rapid', lm: 'collapsing', em: 'diffuseEffacement' },
    course: null,
  },
  // --- Subepithelial deposits ---------------------------------------------
  mn: {
    group: 'subepi',
    labs: { hematuria: [4, 10], lipiduria: [1, 1], upcr: [7, 10], egfr: [70, 90], albumin: [1.6, 2.2], chol: [320, 440], tg: [180, 300], atiii: [45, 60], igg: [350, 550], edema: [3, 3], sbp: [132, 145], pla2r: [70, 180] },
    barrier: { chargeLoss: 0.3, shunt: 0.006 },
    visual: { circulating: 'pla2r', effacement: 'diffuse', subepi: true },
    if: { pattern: 'granularCapillary', reactants: { IgG: 3, IgG4: 3, C3: 1, PLA2R: 3 } },
    clinical: { age: 'adult', years: [40, 65], signs: [] },
    keys: { hematuria: 'frequent', complement: 'normal', steroids: 'notAlone', thrombosis: 'high', biopsy: 'optionalPLA2R', prognosis: 'thirds', lm: 'thickGBM', em: 'subepiDeposits' },
    course: 'mn',
  },
  mnSecondary: {
    group: 'subepi',
    labs: { hematuria: [4, 10], lipiduria: [1, 1], upcr: [5, 8], egfr: [65, 85], albumin: [1.9, 2.5], chol: [280, 380], tg: [170, 280], atiii: [55, 70], igg: [400, 600], edema: [2, 3], sbp: [130, 145], pla2r: [1, 8] },
    barrier: { chargeLoss: 0.3, shunt: 0.005 },
    visual: { circulating: 'ic', effacement: 'diffuse', subepi: true, mesangial: 'IC', subendo: true },
    if: { pattern: 'granularSecondary', reactants: { IgG: 3, C3: 2, C1q: 1 } },
    clinical: { age: 'adult', years: [55, 75], signs: ['tumor'] },
    keys: { hematuria: 'frequent', complement: 'normal', steroids: 'treatCause', thrombosis: 'high', biopsy: 'yes', prognosis: 'cause', lm: 'thickGBM', em: 'subepiPlusOther' },
    course: null,
  },
  // --- Membranoproliferative pattern --------------------------------------
  mpgnIC: {
    group: 'mpgn',
    labs: { hematuria: [15, 40], lipiduria: [1, 1], upcr: [4, 6.5], egfr: [40, 60], albumin: [2.3, 2.9], chol: [250, 320], tg: [160, 240], atiii: [65, 80], igg: [700, 1000], edema: [2, 2], sbp: [148, 165], c3: [40, 70], c4: [3, 8], hcv: [1, 1], cryo: [1, 1] },
    barrier: { chargeLoss: 0.3, shunt: 0.005 },
    visual: { circulating: 'ic', lobular: true, doubleContour: true, subendo: true, mesangial: 'IC' },
    if: { pattern: 'mpgnGranular', reactants: { IgG: 2, IgM: 2, C3: 3, C1q: 1 } },
    clinical: { age: 'adult', years: [40, 65], signs: ['purpura'] },
    keys: { hematuria: 'marked', complement: 'c3c4low', steroids: 'treatCause', thrombosis: 'moderate', biopsy: 'yes', prognosis: 'progressive', lm: 'lobular', em: 'subendoDeposits' },
    course: null,
  },
  c3gn: {
    group: 'mpgn',
    labs: { hematuria: [15, 35], lipiduria: [0, 0], upcr: [3.6, 5.5], egfr: [50, 70], albumin: [2.4, 2.9], chol: [240, 300], tg: [150, 220], atiii: [70, 85], igg: [800, 1000], edema: [1, 2], sbp: [140, 155], c3: [20, 50], c4: [18, 30] },
    barrier: { chargeLoss: 0.3, shunt: 0.004 },
    visual: { circulating: 'c3nef', lobular: true, doubleContour: true, c3dep: true, mesangial: 'C3' },
    if: { pattern: 'c3only', reactants: { C3: 3 } },
    clinical: { age: 'adult', years: [18, 40], signs: [] },
    keys: { hematuria: 'marked', complement: 'c3low', steroids: 'mmf', thrombosis: 'moderate', biopsy: 'yes', prognosis: 'progressive', lm: 'lobular', em: 'c3Deposits' },
    course: null,
  },
  ddd: {
    group: 'mpgn',
    labs: { hematuria: [15, 35], lipiduria: [0, 0], upcr: [3.6, 6], egfr: [55, 75], albumin: [2.3, 2.9], chol: [240, 310], tg: [150, 230], atiii: [70, 85], igg: [800, 1000], edema: [1, 2], sbp: [138, 150], c3: [8, 25], c4: [18, 30], c3nef: [1, 1] },
    barrier: { chargeLoss: 0.3, shunt: 0.004 },
    visual: { circulating: 'c3nef', lobular: true, dense: true, mesangial: 'C3' },
    if: { pattern: 'c3only', reactants: { C3: 3 } },
    clinical: { age: 'adult', years: [12, 25], signs: ['lipodystrophy', 'drusen'] },
    keys: { hematuria: 'marked', complement: 'c3low', steroids: 'mmf', thrombosis: 'moderate', biopsy: 'yes', prognosis: 'progressive', lm: 'lobular', em: 'denseDeposits' },
    course: null,
  },
  // --- Systemic / deposition ----------------------------------------------
  diabetic: {
    group: 'systemic',
    labs: { hematuria: [0, 2], lipiduria: [1, 1], upcr: [3.6, 6], egfr: [30, 50], albumin: [2.4, 2.9], chol: [230, 300], tg: [200, 350], atiii: [70, 85], igg: [700, 950], edema: [1, 2], sbp: [145, 162], hba1c: [7.8, 9.5] },
    barrier: { chargeLoss: 0.5, shunt: 0.004 },
    visual: { circulating: 'glucose', gbmThick: 2, kw: true, hyaline: true, effacement: 'segmental' },
    if: { pattern: 'linearAlbumin', reactants: { IgG: 1, 'Alb.': 1 } },
    clinical: { age: 'adult', years: [55, 72], signs: ['diabetesLong', 'retinopathy'] },
    keys: { hematuria: 'absent', complement: 'normal', steroids: 'notIndicated', thrombosis: 'low', biopsy: 'notTypicalDM', prognosis: 'progressive', lm: 'kwNodules', em: 'thickGBM' },
    course: null,
  },
  amyloid: {
    group: 'systemic',
    labs: { hematuria: [0, 2], lipiduria: [1, 1], upcr: [7, 12], egfr: [50, 75], albumin: [1.6, 2.3], chol: [300, 420], tg: [180, 300], atiii: [50, 65], igg: [350, 600], edema: [3, 3], sbp: [98, 114], mspike: [1, 1] },
    barrier: { chargeLoss: 0.3, shunt: 0.008 },
    visual: { circulating: 'lightChains', amyloid: true, effacement: 'segmental' },
    if: { pattern: 'congo', reactants: { 'λ': 3, 'κ': 0 } },
    clinical: { age: 'adult', years: [55, 75], signs: ['macroglossia', 'cardiac'] },
    keys: { hematuria: 'absent', complement: 'normal', steroids: 'clone', thrombosis: 'moderate', biopsy: 'fatPad', prognosis: 'heart', lm: 'amyloid', em: 'fibrils' },
    course: null,
  },
};

export const ENTITY_IDS = Object.keys(ENTITIES);
export const GROUPS = ['podocyte', 'subepi', 'mpgn', 'systemic'];
export const TREE = GROUPS.map((group) => ({ group, ids: ENTITY_IDS.filter((id) => ENTITIES[id].group === group) }));

export const IF_PATTERNS = ['negative', 'segmentalIgM', 'granularCapillary', 'granularSecondary', 'mpgnGranular', 'c3only', 'linearAlbumin', 'congo'];
export const SIGNS = ['periorbital', 'family', 'steroidResistant', 'obesity', 'tumor', 'nsaid', 'malar', 'purpura', 'lipodystrophy', 'drusen', 'diabetesLong', 'retinopathy', 'macroglossia', 'cardiac'];

export const ageOf = (id) => ENTITIES[id].clinical.age;
const mid = ([a, b]) => (a + b) / 2;

function rangeFor(id, key) {
  const e = ENTITIES[id];
  if (e.labs[key]) return e.labs[key];
  if (key === 'sbp' && e.clinical.age === 'child') return CHILD_SBP;
  return NORMAL_TYPICAL[key] || [0, 0];
}

/** Typical labs at presentation (midpoint of each range). */
export function typicalLabs(id) {
  const out = {};
  for (const p of PARAMS) {
    out[p.key] = p.kind === 'sel' ? selectivityIndex(ENTITIES[id].barrier) : mid(rangeFor(id, p.key));
  }
  return out;
}

/** Normal labs (for comparison and for the "normal" reference). */
export function normalLabs(age = 'adult') {
  const out = {};
  for (const p of PARAMS) out[p.key] = p.kind === 'sel' ? selectivityIndex(NORMAL_BARRIER) : mid(key2normal(p.key, age));
  return out;
}
function key2normal(key, age) { return key === 'sbp' && age === 'child' ? CHILD_SBP : NORMAL_TYPICAL[key]; }

// ---------------------------------------------------------------------------
// Nephrotic syndrome or only nephrotic-range proteinuria?
// ---------------------------------------------------------------------------
/**
 * The syndrome = nephrotic-range proteinuria + hypoalbuminemia (+ edema and
 * hyperlipidemia). "Pure" = no hematuria, hypertension or reduced GFR.
 */
export function nephroticProfile(labs, age = 'adult') {
  const nephroticRange = labs.upcr >= nephroticCut(age);
  const hypoalb = labs.albumin < 3.0;
  // < 3.0 g/dL: the usual threshold for the syndrome (KDIGO 2021 children; adults < 3.0-3.5)
  const edema = Math.round(labs.edema) >= 1;
  const hyperlipidemia = labs.chol > 200;
  const syndrome = nephroticRange && hypoalb;
  const hematuria = labs.hematuria > 3;
  const htn = status('sbp', labs.sbp, age) === 'high';
  const lowGfr = labs.egfr < 60;
  return { nephroticRange, hypoalb, edema, hyperlipidemia, syndrome, hematuria, htn, lowGfr, pure: syndrome && !hematuria && !htn && !lowGfr };
}

/** Rough thrombotic-risk tier from albumin and entity (Modelo; MN is the highest). */
export function thromboRisk(id, albumin) {
  if (albumin >= 3.0) return 'low';
  if (id === 'mn' || id === 'mnSecondary') return albumin < 2.5 ? 'high' : 'moderate';
  return albumin < 2.0 ? 'high' : 'moderate';
}

// ---------------------------------------------------------------------------
// KDIGO 2021 risk categories in membranous nephropathy
// ---------------------------------------------------------------------------
/**
 * Simplified KDIGO 2021 stratification at presentation:
 *  very high: rapid unexplained loss of function / life-threatening NS;
 *  high: eGFR < 60 or proteinuria > 8 g/d, or nephrotic proteinuria with
 *        >= 1 marker (albumin < 2.5 g/dL, PLA2R > 50 RU/mL, selectivity > 0.20);
 *  moderate: normal eGFR, proteinuria > 3.5 g/d, no marker;
 *  low: normal eGFR and proteinuria < 3.5 g/d (or albumin > 3.0 g/dL).
 */
export function mnRisk({ egfr, upcr, albumin, pla2r, selectivity = 0.1, rapidDecline = false }) {
  const reasons = [];
  if (rapidDecline) return { risk: 'veryHigh', reasons: ['rapid'] };
  if (egfr < 60) reasons.push('egfr');
  if (upcr > 8) reasons.push('upcr8');
  if (upcr > 3.5) {
    if (albumin < 2.5) reasons.push('alb');
    if (pla2r > 50) reasons.push('pla2r');
    if (selectivity > 0.2) reasons.push('sel');
  }
  if (reasons.length) return { risk: 'high', reasons };
  if (upcr > 3.5 && albumin <= 3.0) return { risk: 'moderate', reasons: ['nephrotic'] };
  return { risk: 'low', reasons: ['subnephrotic'] };
}

// ---------------------------------------------------------------------------
// Time model 1: podocytopathies on treatment (weeks; Modelo)
// ---------------------------------------------------------------------------
// UPCR(t) = floor + (u0 - floor)·exp(-max(0, t - lag)/tau)
// Prednisone from week 0 (MCD, primary and genetic FSGS); RAAS blockade +
// SGLT2 inhibitor in adaptive FSGS, where glucocorticoids are not indicated.
export const PODO = {
  weeks: 16,
  mcd: { therapy: 'steroids', lag: 0.3, tau: 0.35, floor: 0.1 },
  // remission in ~2 weeks: most steroid-sensitive children remit within 4 weeks
  fsgsPrimary: { therapy: 'steroids', lag: 2, tau: 5, floor: 2.5 },
  // slow, partial: KDIGO allows up to 16 weeks of high-dose glucocorticoids before calling resistance
  fsgsGenetic: { therapy: 'steroids', lag: 0, tau: 1, floor: null },
  // no response (floor = baseline): genetic forms do not respond to immunosuppression
  fsgsAdaptive: { therapy: 'raas', lag: 0.5, tau: 3, floorFrac: 0.6 },
  // ~40 % lower proteinuria with maximal RAAS blockade + SGLT2 inhibitor (Modelo)
};

function podoParams(id) {
  const P = PODO[id];
  const L = ENTITIES[id].labs;
  const u0 = mid(L.upcr);
  const floor = P.floor == null ? (P.floorFrac != null ? u0 * P.floorFrac : u0) : P.floor;
  return { ...P, u0, floor, alb0: mid(L.albumin), chol0: mid(L.chol) };
}

export function podoUpcr(id, week) {
  const P = podoParams(id);
  const t = Math.max(0, week - P.lag);
  return P.floor + (P.u0 - P.floor) * Math.exp(-t / P.tau);
}

/** Albumin recovers in proportion to the fall in proteinuria (Modelo). */
export function albuminFrom(upcr, u0, alb0, target = 4.2) {
  const f = clamp(upcr / u0, 0, 1);
  return target - (target - alb0) * f;
}

export function edemaFrom(albumin) {
  return albumin < 2.0 ? 3 : albumin < 2.5 ? 2 : albumin < 3.0 ? 1 : 0;
}

function lipidsFrom(albumin, alb0, chol0, tg0) {
  const f = clamp((4.2 - albumin) / Math.max(0.01, 4.2 - alb0), 0, 1);
  return { chol: 175 + (chol0 - 175) * f, tg: 110 + (tg0 - 110) * f };
}

/** Remission state, with the KDIGO thresholds for children and adults. */
export function remission(upcr, u0, age = 'adult', albumin = 4) {
  if (age === 'child') {
    if (upcr <= 0.2) return 'complete';
    if (upcr < 2 && albumin >= 3.0) return 'partial';
    return 'none';
  }
  if (upcr < 0.3) return 'complete';
  if (upcr <= 3.5 && upcr <= 0.5 * u0) return 'partial';
  return 'none';
}

/** Weeks of full-dose prednisone after which no complete remission = steroid resistance. */
export const resistanceWeek = (age) => (age === 'child' ? 4 : 16);

export function podoLabs(id, week) {
  const P = podoParams(id);
  const base = typicalLabs(id);
  const upcr = podoUpcr(id, week);
  const albumin = albuminFrom(upcr, P.u0, P.alb0);
  const lip = lipidsFrom(albumin, P.alb0, P.chol0, mid(ENTITIES[id].labs.tg));
  const f = clamp((4.2 - albumin) / Math.max(0.01, 4.2 - P.alb0), 0, 1);
  return {
    ...base, upcr, albumin, chol: lip.chol, tg: lip.tg,
    edema: id === 'fsgsAdaptive' ? 0 : edemaFrom(albumin),
    lipiduria: f > 0.5 ? base.lipiduria : 0,
    atiii: 100 - (100 - base.atiii) * f,
    igg: 1000 - (1000 - base.igg) * f,
  };
}

export function podoSeries(id, step = 0.25) {
  const x = [];
  for (let w = 0; w <= PODO.weeks + 1e-9; w += step) x.push(Math.round(w * 100) / 100);
  return { week: x, upcr: x.map((w) => podoUpcr(id, w)) };
}

/** First week with complete remission, or null. */
export function weekOfRemission(id) {
  const age = ageOf(id);
  const P = podoParams(id);
  for (let w = 0; w <= PODO.weeks; w += 0.05) {
    const u = podoUpcr(id, w);
    if (remission(u, P.u0, age, albuminFrom(u, P.u0, P.alb0)) === 'complete') return Math.round(w * 100) / 100;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Time model 2: membranous nephropathy (months; Modelo)
// ---------------------------------------------------------------------------
// anti-PLA2R titre T: without treatment it falls slowly, and more slowly the
// higher it is (spontaneous remission is likelier with low titres); after
// rituximab it falls with a short lag. Proteinuria follows the titre with a
// first-order delay of several months (deposits must be cleared and the
// podocyte repaired), so immunological remission precedes clinical remission.
//   k_spont = 0.12·exp(-T0/40) /month
//   after rituximab (lag 0.5 month): k = 0.6 /month
//   U_target = 0.15 + (u0 - 0.15)·min(1, T/T0)
//   dU/dt = (U_target - U) / tauU,  tauU = 4 months
export const MN = { months: 24, dt: 0.05, lagTx: 0.5, kTx: 0.6, kSpont: 0.12, kScale: 40, tauU: 4, uMin: 0.15, cutoff: 14, floor: 1 };
// floor: assay lower limit of detection shown on screen (RU/mL)

export function mnModel({ txMonth = 1, pla2r0 = 125, u0 = 8.5, alb0 = 1.9, months = MN.months } = {}) {
  const out = { month: [], pla2r: [], upcr: [], albumin: [] };
  const kS = MN.kSpont * Math.exp(-pla2r0 / MN.kScale);
  let U = u0;
  const n = Math.round(months / MN.dt);
  for (let i = 0; i <= n; i++) {
    const t = i * MN.dt;
    let T;
    if (txMonth == null || t < txMonth + MN.lagTx) T = pla2r0 * Math.exp(-kS * t);
    else {
      const t1 = txMonth + MN.lagTx;
      T = pla2r0 * Math.exp(-kS * t1) * Math.exp(-MN.kTx * (t - t1));
    }
    if (i % 5 === 0) {
      out.month.push(Math.round(t * 100) / 100);
      out.pla2r.push(Math.max(T, MN.floor));
      out.upcr.push(U);
      out.albumin.push(albuminFrom(U, u0, alb0));
    }
    const target = MN.uMin + (u0 - MN.uMin) * Math.min(1, T / pla2r0);
    U += (MN.dt * (target - U)) / MN.tauU;
  }
  return out;
}

export const MN_PLA2R0 = { default: 125, min: 15, max: 250 };
const mnBase = (pla2r0 = MN_PLA2R0.default) => ({ pla2r0, u0: mid(ENTITIES.mn.labs.upcr), alb0: mid(ENTITIES.mn.labs.albumin) });

export function mnAt(month, { txMonth = 1, pla2r0 } = {}) {
  const m = mnModel({ txMonth, ...mnBase(pla2r0) });
  const i = clamp(Math.round(month / (MN.dt * 5)), 0, m.month.length - 1);
  return { month: m.month[i], pla2r: m.pla2r[i], upcr: m.upcr[i], albumin: m.albumin[i] };
}

export function mnLabs(month, opts = {}) {
  const s = mnAt(month, opts);
  const base = typicalLabs('mn');
  const b = mnBase(opts.pla2r0);
  const lip = lipidsFrom(s.albumin, b.alb0, mid(ENTITIES.mn.labs.chol), mid(ENTITIES.mn.labs.tg));
  const f = clamp((4.2 - s.albumin) / (4.2 - b.alb0), 0, 1);
  return {
    ...base, pla2r: s.pla2r, upcr: s.upcr, albumin: s.albumin, chol: lip.chol, tg: lip.tg,
    edema: edemaFrom(s.albumin), lipiduria: f > 0.5 ? 1 : 0,
    atiii: 100 - (100 - base.atiii) * f, igg: 1000 - (1000 - base.igg) * f,
    hematuria: base.hematuria * (0.3 + 0.7 * f),
  };
}

/** Month when a condition first holds (null if never in the window). */
export function mnFirstMonth(pred, opts = {}) {
  const m = mnModel({ ...mnBase(opts.pla2r0), txMonth: opts.txMonth === undefined ? 1 : opts.txMonth });
  for (let i = 0; i < m.month.length; i++) if (pred(m.pla2r[i], m.upcr[i], m.albumin[i])) return m.month[i];
  return null;
}

export function mnMilestones(txMonth, pla2r0) {
  const u0 = mnBase().u0;
  const o = { txMonth, pla2r0 };
  return {
    immunological: mnFirstMonth((T) => T < MN.cutoff, o),
    partial: mnFirstMonth((T, U) => U <= 3.5 && U <= 0.5 * u0, o),
    complete: mnFirstMonth((T, U) => U < 0.3, o),
  };
}

/** MN scenario -> model options. */
export const mnOpts = (sc = {}) => ({ txMonth: sc.noTx ? null : sc.txMonth ?? 1, pla2r0: sc.pla2r0 ?? MN_PLA2R0.default });

// ---------------------------------------------------------------------------
// Membranous nephropathy stages (Ehrenreich-Churg I-IV)
// ---------------------------------------------------------------------------
export const MN_STAGES = [1, 2, 3, 4];

// ---------------------------------------------------------------------------
// Labs for a scenario
// ---------------------------------------------------------------------------
export function labsFor(id, sc = {}) {
  const c = ENTITIES[id].course;
  if ((c === 'steroids' || c === 'raas') && sc.week != null) return podoLabs(id, sc.week);
  if (c === 'mn' && sc.month != null) return mnLabs(sc.month, mnOpts(sc));
  return typicalLabs(id);
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------
export const FEATURES = ['group', 'age', 'ifPattern', 'lm', 'em', 'selectivity', 'hematuria', 'complement', 'steroids', 'thrombosis', 'biopsy', 'prognosis'];

function featureValue(id, f) {
  const e = ENTITIES[id];
  switch (f) {
    case 'group': return e.group;
    case 'age': return e.clinical.age;
    case 'ifPattern': return e.if.pattern;
    case 'selectivity': return selectivityClass(selectivityIndex(e.barrier));
    default: return e.keys[f] ?? null;
  }
}
export const feature = featureValue;

/** Rows for a side-by-side comparison; `differs` marks what tells them apart. */
export function compare(a, b) {
  const la = typicalLabs(a), lb = typicalLabs(b);
  const ageA = ageOf(a), ageB = ageOf(b);
  const labs = PARAMS.map((p) => {
    const sa = status(p.key, la[p.key], ageA);
    const sb = status(p.key, lb[p.key], ageB);
    return { key: p.key, a: la[p.key], b: lb[p.key], statusA: sa, statusB: sb, differs: sa !== sb };
  });
  const features = FEATURES.map((f) => {
    const va = featureValue(a, f), vb = featureValue(b, f);
    return { key: f, a: va, b: vb, differs: va !== vb };
  });
  return { labs, features };
}

// ---------------------------------------------------------------------------
// Rule engine: findings -> entity
// ---------------------------------------------------------------------------
/** What the biopsy would show (null when it is not done in the typical case). */
export function biopsyOf(id) {
  const e = ENTITIES[id];
  if (e.keys.biopsy === 'notChild' || e.keys.biopsy === 'notTypicalDM') return null;
  if (e.keys.biopsy === 'fatPad') return { site: 'fat', if: 'congo', lm: 'amyloid', em: 'fibrils' };
  return { site: 'kidney', if: e.if.pattern, lm: e.keys.lm, em: e.keys.em };
}

export function findingsFrom(id, labs, extra = {}) {
  const e = ENTITIES[id];
  const age = ageOf(id);
  const prof = nephroticProfile(labs, age);
  return {
    age,
    ...prof,
    c3Low: status('c3', labs.c3) === 'low',
    c4Low: status('c4', labs.c4) === 'low',
    pla2rPos: labs.pla2r >= 14,
    ana: labs.ana >= 1,
    hbsag: labs.hbsag >= 0.5,
    hcv: labs.hcv >= 0.5,
    hiv: labs.hiv >= 0.5,
    cryo: labs.cryo >= 0.5,
    c3nef: labs.c3nef >= 0.5,
    mspike: labs.mspike >= 0.5,
    hba1cHigh: labs.hba1c >= 6.5,
    signs: extra.signs ?? [...e.clinical.signs],
    biopsy: extra.biopsy === undefined ? biopsyOf(id) : extra.biopsy,
  };
}

/**
 * Stepwise reasoning for a nephrotic presentation. Returns the most likely
 * entity and the steps (i18n keys) that led there.
 */
export function classify(f) {
  const steps = [];
  const has = (s) => f.signs.includes(s);
  const b = f.biopsy;
  // 0. Is it the syndrome at all?
  if (f.nephroticRange && !f.syndrome) {
    steps.push('stepNotSyndrome');
    if (has('obesity')) steps.push('stepAdaptive');
    return { entity: 'fsgsAdaptive', steps };
  }
  steps.push('stepSyndrome');
  // 1. Systemic diseases that explain it
  if (f.mspike || (b && b.if === 'congo')) {
    steps.push('stepMonoclonal');
    return { entity: 'amyloid', steps };
  }
  if ((f.hba1cHigh || has('diabetesLong')) && has('retinopathy') && !f.hematuria) {
    steps.push('stepDiabetic');
    return { entity: 'diabetic', steps };
  }
  // 2. Low C3: membranoproliferative pattern
  if (f.c3Low) {
    steps.push('stepC3Low');
    if (f.c4Low || f.hcv || f.cryo) { steps.push('stepIC'); return { entity: 'mpgnIC', steps }; }
    steps.push('stepC3G');
    if (has('lipodystrophy') || has('drusen') || (b && b.em === 'denseDeposits')) { steps.push('stepDDD'); return { entity: 'ddd', steps }; }
    steps.push('stepC3GN');
    return { entity: 'c3gn', steps };
  }
  steps.push('stepC3Normal');
  // 3. Membranous: PLA2R first
  if (f.pla2rPos) { steps.push('stepPLA2R'); return { entity: 'mn', steps }; }
  // 4. HIV: collapsing FSGS
  if (f.hiv) { steps.push('stepHIV'); return { entity: 'fsgsCollapsing', steps }; }
  // 5. Children: steroid-sensitive vs genetic
  if (f.age === 'child') {
    if (has('family') || has('steroidResistant')) { steps.push('stepGenetic'); return { entity: 'fsgsGenetic', steps }; }
    steps.push('stepChildPure');
    return { entity: 'mcd', steps };
  }
  // 6. Adults: the biopsy decides
  if (b && (b.em === 'subepiPlusOther' || b.if === 'granularSecondary' || b.em === 'subepiDeposits')) {
    steps.push('stepSecondaryMN');
    return { entity: 'mnSecondary', steps };
  }
  if (b && b.lm === 'collapsing') { steps.push('stepHIV'); return { entity: 'fsgsCollapsing', steps }; }
  if (b && b.lm === 'normal') { steps.push('stepAdultMCD'); return { entity: 'mcd', steps }; }
  steps.push('stepFSGS');
  return { entity: 'fsgsPrimary', steps };
}

// ---------------------------------------------------------------------------
// Quiz cases
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SECONDARY_MN_CAUSES = ['tumor', 'hbv', 'lupus', 'nsaid'];

/**
 * Deterministic case: picks an entity (unless given) and draws each lab
 * inside its typical range, so the pattern always matches the entity.
 */
export function generateCase(seed, entityId = null) {
  const rnd = mulberry32(seed);
  const id = entityId ?? ENTITY_IDS[Math.floor(rnd() * ENTITY_IDS.length)];
  const e = ENTITIES[id];
  const labs = {};
  for (const p of PARAMS) {
    if (p.kind === 'sel') { labs[p.key] = selectivityIndex(e.barrier) * (0.85 + rnd() * 0.3); continue; }
    const [lo, hi] = rangeFor(id, p.key);
    let v = lo + rnd() * (hi - lo);
    if (p.kind === 'qual' || p.kind === 'ord') v = Math.round(v);
    labs[p.key] = v;
  }
  let signs = [...e.clinical.signs];
  let cause = null;
  if (id === 'mnSecondary') {
    cause = SECONDARY_MN_CAUSES[Math.floor(rnd() * SECONDARY_MN_CAUSES.length)];
    signs = [];
    if (cause === 'tumor') signs.push('tumor');
    if (cause === 'nsaid') signs.push('nsaid');
    if (cause === 'hbv') labs.hbsag = 1;
    if (cause === 'lupus') { labs.ana = 4 + rnd() * 4; signs.push('malar'); }
  }
  if (id === 'c3gn') labs.c3nef = rnd() < 0.45 ? 1 : 0; // C3NeF in under half of C3GN
  const [y0, y1] = e.clinical.years;
  const years = Math.round(y0 + rnd() * (y1 - y0));
  return { seed, entity: id, labs, age: ageOf(id), years, signs, cause, biopsy: biopsyOf(id) };
}

// ---------------------------------------------------------------------------
// Presets (teacher deep links: ?preset=<key>)
// ---------------------------------------------------------------------------
export const PRESETS = {
  'nino-edema-palpebral': { mode: 'explore', entity: 'mcd', week: 0 },
  'cambios-minimos-corticoides': { mode: 'explore', entity: 'mcd', week: 3 },
  'barrera-selectiva': { mode: 'explore', entity: 'mcd', view: 'barrier' },
  'pedicelos-3d': { mode: 'explore', entity: 'mcd', view: '3d' },
  'gesf-primaria': { mode: 'explore', entity: 'fsgsPrimary', week: 16 },
  'gesf-genetica': { mode: 'explore', entity: 'fsgsGenetic', week: 6 },
  'proteinuria-sin-sindrome': { mode: 'explore', entity: 'fsgsAdaptive', week: 0 },
  'gesf-colapsante-vih': { mode: 'explore', entity: 'fsgsCollapsing' },
  'membranosa': { mode: 'explore', entity: 'mn', stage: 2, month: 0 },
  'membranosa-estadios': { mode: 'explore', entity: 'mn', stage: 1, month: 0, view: 'barrier' },
  'membranosa-3d': { mode: 'explore', entity: 'mn', stage: 2, month: 0, view: '3d' },
  'membranosa-rituximab': { mode: 'explore', entity: 'mn', month: 12, txMonth: 1 },
  'membranosa-sin-tratamiento': { mode: 'explore', entity: 'mn', month: 12, noTx: true },
  'membranosa-titulo-bajo': { mode: 'explore', entity: 'mn', month: 12, noTx: true, pla2r0: 20 },
  'barrera-no-selectiva': { mode: 'explore', entity: 'mn', view: 'barrier', month: 0 },
  'membranosa-secundaria': { mode: 'explore', entity: 'mnSecondary' },
  'gnmp-vhc': { mode: 'explore', entity: 'mpgnIC' },
  'glomerulopatia-c3': { mode: 'explore', entity: 'c3gn' },
  'depositos-densos': { mode: 'explore', entity: 'ddd' },
  'nefropatia-diabetica': { mode: 'explore', entity: 'diabetic' },
  'amiloidosis': { mode: 'explore', entity: 'amyloid' },
  'cambios-minimos-vs-gesf': { mode: 'compare', a: 'mcd', b: 'fsgsPrimary' },
  'sindrome-vs-proteinuria-nefrotica': { mode: 'compare', a: 'fsgsPrimary', b: 'fsgsAdaptive' },
  'membranosa-primaria-vs-secundaria': { mode: 'compare', a: 'mn', b: 'mnSecondary' },
  'c3gn-vs-ddd': { mode: 'compare', a: 'c3gn', b: 'ddd' },
  'diabetes-vs-amiloidosis': { mode: 'compare', a: 'diabetic', b: 'amyloid' },
  'quiz': { mode: 'quiz' },
};

export function defaultScenario(id) {
  const c = ENTITIES[id].course;
  if (c === 'steroids' || c === 'raas') return { week: 0 };
  if (c === 'mn') return { month: 0, txMonth: 1, noTx: false, stage: 2, pla2r0: MN_PLA2R0.default };
  if (id === 'mnSecondary') return { stage: 2 };
  return {};
}
