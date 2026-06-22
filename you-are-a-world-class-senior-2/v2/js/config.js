/* =============================================================================
 * Warehouse Flow Commander — configuration & design system
 * Single source of truth for palette, layout, tuning, freight, glossary,
 * and the campaign scenario definitions.
 * ===========================================================================*/

const GAME = { W: 1280, H: 720 };

const FONTS = {
  display: "Oswald",
  ui: "Barlow Semi Condensed",
};

/* Hex (Phaser) + css strings for the same brand palette. */
const PAL = {
  bg0: 0x05080a,
  bg1: 0x0a1014,
  bg2: 0x11191e,
  steel: 0x1b262d,
  steelLight: 0x26343d,
  line: 0x33454f,
  floor: 0x3c444a,
  floorAlt: 0x434c53,
  floorLine: 0xb9c2c7,

  amber: 0xf5a524,
  amberDark: 0xb9740d,
  cyan: 0x38bdf8,
  green: 0x34d399,
  red: 0xf43f5e,
  yellow: 0xfacc15,
  orange: 0xf97316,
  purple: 0xa855f7,
  blue: 0x3b82f6,
  brown: 0x9a6a3a,
  white: 0xf4f8fa,
};

const CSS = {
  text: "#e6eef2",
  textDim: "#aebcc4",
  muted: "#8194a0",
  amber: "#f5a524",
  cyan: "#7dd3fc",
  green: "#6ee7b7",
  red: "#fb7185",
  yellow: "#fde047",
  white: "#f4f8fa",
  ink: "#0a1014",
};

/* Freight mix. weight = spawn probability %, must sum to 100.
 * "Blue" is special: it routes to the IBT lane, not shared staging. */
const FREIGHT = [
  { key: "Brown", label: "Standard", color: PAL.brown, css: "#b8854f", weight: 38 },
  { key: "Red", label: "Priority", color: PAL.red, css: "#fb7185", weight: 22 },
  { key: "Orange", label: "Hazmat", color: PAL.orange, css: "#fdba74", weight: 16 },
  { key: "Purple", label: "Oversize", color: PAL.purple, css: "#c4b5fd", weight: 14 },
  { key: "Blue", label: "Transfer", color: PAL.blue, css: "#93c5fd", weight: 10 },
];

/* Baseline gameplay tuning. Scenarios override fields via `tune`. */
const TUNE = {
  shiftMs: 7 * 60 * 1000,
  artCapacity: 100,
  primarySpawnMs: 900,
  secondarySpawnMs: 2100,
  artRefillMs: 42000,
  raaPalletBoxes: 10,
  raaPrepCapacity: 5,
  raaPrepMs: 2000,
  baseCount: 5,
  baseCapacity: 6,
  stagingLanes: 5,
  stagingCapacity: 3,
  ibtCapacity: 10,
  ibtClearMs: 15000,
  gpmMs: 3600,
  gpmChance: 0.58,
  emptyStackCapacity: 7,
  workerSpeed: 142,
  rcWorkerSpeed: 292,
  flowWarning: 70,
  flowCritical: 40,
  blueWeight: null, // when set, overrides Blue freight weight
  staff: 4,         // dock laborers (RC operator is the player, separate)

  // ---- RC-operator edition ----
  lineCap: 12,              // boxes a dock inbound line holds before back-pressure
  workerPickMs: 260,        // time a worker spends grabbing/placing a box
  rcQueueMax: 2,            // RC current job + this many queued
  offerLeadBacklog: 14,     // ART level at which the next trailer is offered
  offerCooldownMs: 9000,    // wait after rejecting before a new trailer is offered
  offerBlue: { min: 6, max: 24, badChance: 0.32, badMin: 34, badMax: 54 },
  partialMinBoxes: 2,       // smallest partial pallet you may ship

  scores: {
    cleanStage: 120,
    hotStage: 60,
    ibtStage: 140,
    gpmClear: 35,
    raaPrep: 35,
    smoothRaa: 125,
    emptyPallet: 10,
    trailerAccept: 20,
    trailerReject: -8,
    rework: -45,
    manualGpm: -75,
    mixedLane: -35,
    starvation: -35,
    blockedTick: -25,
    ibtOverflow: -35,
    partialShip: -40,
    haul: 6,
  },
};

/* ---------- Layout: full-bleed world + floating glass panels ---------- */
const LAYOUT = {
  world: { x: 0, y: 0, w: GAME.W, h: GAME.H },
  panels: {
    hud: { x: 0, y: 0, w: GAME.W, h: 62 },
    roster: { x: 12, y: 74, w: 190, h: 506 },
    ops: { x: 1078, y: 74, w: 190, h: 506 },
    command: { x: 0, y: 662, w: GAME.W, h: 58 },
  },
  /* dock doors along the back wall (visual + trailer animation anchors) */
  dockWall: { y: 60, h: 96 },
  doors: {
    primary: [{ x: 300, y: 104 }, { x: 404, y: 104 }],
    secondary: [{ x: 876, y: 104 }, { x: 980, y: 104 }],
    empty: [{ x: 600, y: 104 }],
    ibt: [{ x: 690, y: 104 }],
  },
};

/* Interactive map zones (centered coords). */
const ZONES = [
  { id: "primary", label: "PRIMARY DOCK", assignment: "primary", x: 352, y: 268, w: 236, h: 226, color: PAL.cyan, icon: "box" },
  { id: "secondary", label: "SECONDARY DOCK", assignment: "secondary", x: 928, y: 268, w: 236, h: 226, color: PAL.purple, icon: "box" },
  { id: "staging", label: "SHARED STAGING", assignment: "staging", x: 640, y: 318, w: 242, h: 250, color: PAL.green, icon: "forklift" },
  { id: "raaPrimary", label: "P · RAA PREP", assignment: "raaPrimary", x: 318, y: 566, w: 176, h: 78, color: PAL.yellow, icon: "crate", noWorkerAssignment: true },
  { id: "raaSecondary", label: "S · RAA PREP", assignment: "raaSecondary", x: 962, y: 566, w: 176, h: 78, color: PAL.yellow, icon: "crate", noWorkerAssignment: true },
  { id: "primaryStack", label: "P EMPTIES", assignment: "primaryStack", x: 336, y: 452, w: 92, h: 64, color: PAL.brown, icon: "handtruck", noWorkerAssignment: true },
  { id: "secondaryStack", label: "S EMPTIES", assignment: "secondaryStack", x: 944, y: 452, w: 92, h: 64, color: PAL.brown, icon: "handtruck", noWorkerAssignment: true },
  { id: "emptyTrailer", label: "EMPTY TRAILER", assignment: "emptyTrailer", x: 562, y: 566, w: 80, h: 78, color: PAL.brown, icon: "truck", noWorkerAssignment: true },
  { id: "ibt", label: "IBT TRANSFER", assignment: "ibt", x: 718, y: 566, w: 80, h: 78, color: PAL.blue, icon: "warehouse", noWorkerAssignment: true },
];

const ASSIGNMENT_LABELS = {
  idle: "Idle",
  primary: "Primary Dock",
  secondary: "Secondary Dock",
  staging: "RC Operator",
  floater: "Floater",
};

const WORKER_SHEET = {
  key: "workerSheet",
  path: "assets/worker_sprites_v2.png",
  frameWidth: 96,
  frameHeight: 128,
  scale: 0.5,
};

const RC_SHEET = {
  key: "rcOperatorSheet",
  path: "assets/rc_operator_sprites.png",
  frameWidth: 144,
  frameHeight: 112,
  scale: 0.74,
};

const ROSTER_NAMES = ["Avery", "Blake", "Casey", "Drew", "Emery", "Frankie"];

/* ---------- Training glossary (always available in-game) ---------- */
const GLOSSARY = [
  { term: "You = RC Operator", icon: "forklift", text: "You drive the forklift. Click a full pallet to haul it to staging (blue auto-routes to IBT). You also prep RAA, restock empties, accept/reject trailers, and reassign crew." },
  { term: "Inbound Line", icon: "box", text: "The conveyor at each dock. The ART/RAA source drops boxes here; your crew carries them to color-matched bases. If the line jams (cap reached) flow suffers — move a worker over." },
  { term: "Trailer Manifest", icon: "truck", text: "When ART runs low a trailer is offered with a freight mix (its blue %). Accept it to dock, or reject a blue-heavy load to avoid flooding IBT — rejecting costs idle time." },
  { term: "ART", icon: "truck", text: "Auto-Replenishment Trailer — a dock's main inbound source. When it empties, accept an offered trailer or switch the dock to RAA backup." },
  { term: "RAA", icon: "crate", text: "Reserve / Active Adjust pallets. Backup freight you pre-build (10 boxes) so a dock keeps flowing while an ART trailer is swapped." },
  { term: "Base", icon: "box", text: "A build position at a dock. Workers stack same-color boxes here. At 6 boxes it becomes a full pallet and blocks until you haul it. Ship Partial to clear one early." },
  { term: "Staging Lane", icon: "forklift", text: "Outbound lanes that group finished pallets by color. Three matching pallets complete a lane. Mixing colors jams the lane and costs score." },
  { term: "GPM", icon: "warehouse", text: "Ground Pickup Move. The trailer sweep that periodically clears completed (clean) staging lanes. Calling a manual GPM clears everything but is penalized." },
  { term: "IBT", icon: "warehouse", text: "Inter-Building Transfer. Blue 'Transfer' freight is carried to the IBT lane instead of staging, then trucked out when you clear it. Overflow is penalized." },
  { term: "Flow Health", icon: "cog", text: "The floor's overall pressure gauge. Inbound backlog, blocked bases, full pallets, mixed lanes, and dry sources all drag it down. Keep it green." },
];

/* ---------- Campaign scenarios (RC-operator edition) ---------- */
const SCENARIOS = [
  {
    id: "onboarding",
    name: "First Shift",
    tag: "TRAINING",
    difficulty: 1,
    weather: "day",
    subtitle: "Learn the forklift",
    brief: "You are the RC operator. Your crew builds pallets on the docks; you haul the full ones to staging, run blue to IBT, and keep the floor flowing. A calm shift to learn the controls.",
    tune: { shiftMs: 5 * 60 * 1000, primarySpawnMs: 1150, secondarySpawnMs: 1500, staff: 4 },
    objectives: [
      { id: "flow", label: "Finish with flow health above 60%", kind: "finalFlow", target: 60 },
      { id: "clean", label: "Complete at least 2 clean staging lanes", kind: "stat", stat: "cleanLanes", target: 2 },
    ],
    star2Flow: 75,
    star3Flow: 88,
  },
  {
    id: "trailerSurge",
    name: "Trailer Surge",
    tag: "VOLUME",
    difficulty: 2,
    weather: "day",
    subtitle: "Inbound is slamming both docks",
    brief: "Trailers are arriving back-to-back and the inbound lines are filling fast. Prioritize which full pallets to haul, and move a worker to whichever dock is drowning.",
    tune: { shiftMs: 7 * 60 * 1000, primarySpawnMs: 980, secondarySpawnMs: 1120, staff: 4 },
    objectives: [
      { id: "flow", label: "Average flow health 70%+", kind: "avgFlow", target: 70 },
      { id: "mixed", label: "No more than 2 mixed lanes", kind: "statMax", stat: "mixedMistakes", target: 2 },
    ],
    star2Flow: 72,
    star3Flow: 84,
  },
  {
    id: "shortStaffed",
    name: "Short-Staffed",
    tag: "LABOR",
    difficulty: 3,
    weather: "dawn",
    subtitle: "An associate called out",
    brief: "You are down to three associates on the floor. Reassign labor to the busier dock as volume shifts, and protect your own forklift time — every haul counts.",
    tune: { shiftMs: 7 * 60 * 1000, primarySpawnMs: 1120, secondarySpawnMs: 1280, staff: 3 },
    objectives: [
      { id: "flow", label: "Average flow health 65%+", kind: "avgFlow", target: 65 },
      { id: "util", label: "Keep worker utilization 80%+", kind: "avgUtil", target: 80 },
    ],
    star2Flow: 68,
    star3Flow: 80,
  },
  {
    id: "blueSpike",
    name: "Blue Freight Spike",
    tag: "IBT",
    difficulty: 3,
    weather: "day",
    subtitle: "Transfer volume is way up",
    brief: "Inbound trailers are heavy with blue Transfer freight that must go to IBT, not staging. Read each trailer manifest — reject the worst blue loads — and clear IBT before it overflows.",
    tune: { shiftMs: 7 * 60 * 1000, primarySpawnMs: 1040, secondarySpawnMs: 1220, blueWeight: 24, ibtCapacity: 9, ibtClearMs: 16000, staff: 4,
      offerBlue: { min: 14, max: 38, badChance: 0.5, badMin: 42, badMax: 62 } },
    objectives: [
      { id: "ibt", label: "Zero IBT overflows", kind: "statMax", stat: "ibtOverflow", target: 0 },
      { id: "flow", label: "Average flow health 66%+", kind: "avgFlow", target: 66 },
    ],
    star2Flow: 70,
    star3Flow: 82,
  },
  {
    id: "raaCrunch",
    name: "RAA Crunch",
    tag: "SOURCING",
    difficulty: 4,
    weather: "dusk",
    subtitle: "Trailers are slow to swap",
    brief: "ART trailers are small and slow to return, so docks run dry often. Pre-build RAA backup pallets and switch sources smoothly before a line starves.",
    tune: { shiftMs: 7 * 60 * 1000, artCapacity: 62, artRefillMs: 52000, primarySpawnMs: 1080, secondarySpawnMs: 1240, staff: 4 },
    objectives: [
      { id: "missed", label: "Never let a dock run RAA-dry", kind: "statMax", stat: "missedRaa", target: 0 },
      { id: "smooth", label: "Make 3+ smooth RAA transitions", kind: "stat", stat: "smoothRaa", target: 3 },
    ],
    star2Flow: 70,
    star3Flow: 82,
  },
  {
    id: "peakDay",
    name: "Peak Day",
    tag: "BOSS",
    difficulty: 5,
    weather: "night",
    subtitle: "Everything, all at once",
    brief: "Peak volume, fast trailers, heavy blue, tight labor. The final exam for an RC operator: prioritize hauls, manage trailers and RAA, balance the crew, and keep the floor green.",
    tune: { shiftMs: 8 * 60 * 1000, primarySpawnMs: 840, secondarySpawnMs: 960, artCapacity: 80, artRefillMs: 48000, blueWeight: 18, staff: 5,
      offerBlue: { min: 10, max: 30, badChance: 0.4, badMin: 38, badMax: 56 } },
    objectives: [
      { id: "flow", label: "Average flow health 60%+", kind: "avgFlow", target: 60 },
      { id: "mixed", label: "No more than 3 mixed lanes", kind: "statMax", stat: "mixedMistakes", target: 3 },
    ],
    star2Flow: 66,
    star3Flow: 80,
  },
];

/* ---------- shared layout geometry (sim + renderer must agree) ---------- */
const ZONE_BY = {};
ZONES.forEach((z) => { ZONE_BY[z.assignment] = z; });

function zoneOf(assignment) { return ZONE_BY[assignment]; }

/* Grid of build bases inside a dock zone (2 columns). */
function basePos(sideKey, index, count) {
  const z = ZONE_BY[sideKey];
  const cols = 2, colGap = 112, rowGap = 58;
  const col = index % cols, row = Math.floor(index / cols);
  return {
    x: z.x - colGap / 2 + col * colGap,
    y: z.y - z.h / 2 + 70 + row * rowGap,
  };
}

function stackPos(sideKey) {
  const z = ZONE_BY[`${sideKey}Stack`];
  return { x: z.x, y: z.y };
}

/* Vertical staging lane positions. */
function lanePos(index, total) {
  const z = ZONE_BY.staging;
  const gap = 46;
  const startX = z.x - ((total - 1) * gap) / 2;
  return { x: startX + index * gap, y: z.y + 22 };
}

function zoneHome(assignment) {
  const z = ZONE_BY[assignment] || ZONE_BY.staging;
  return { x: z.x, y: z.y + 18 };
}

/* Inbound conveyor line: a short belt across the top of the dock. Workers pick
   up at the head (center); queued boxes ride along the belt. */
const LINE_VISIBLE = 6;
function lineHeadPos(sideKey) {
  const z = ZONE_BY[sideKey];
  return { x: z.x, y: z.y - z.h / 2 + 30 };
}
function lineSlotPos(sideKey, i) {
  const z = ZONE_BY[sideKey];
  return { x: z.x - 62 + (i % LINE_VISIBLE) * 22, y: z.y - z.h / 2 + 22 };
}
/* Idle workers wait along the bottom of their dock. */
function restPos(sideKey, i) {
  const z = ZONE_BY[sideKey];
  return { x: z.x - 44 + (i % 3) * 44, y: z.y + z.h / 2 - 12 };
}
/* RC forklift idle home — just below shared staging. */
function rcHome() {
  const z = ZONE_BY.staging;
  return { x: z.x, y: z.y + z.h / 2 + 6 };
}

/* Build a freight mix table for a trailer manifest with a given blue %. */
function makeOfferMix(bluePct) {
  return freightTable(clamp(Math.round(bluePct), 0, 80));
}
function blueShareOf(table) {
  const b = (table || FREIGHT).find((f) => f.key === "Blue");
  return b ? Math.round(b.weight) : 0;
}

/* ---------- helpers ---------- */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rint(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

function formatTime(ms) {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(safe / 60);
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function freightTable(blueWeight) {
  if (blueWeight == null) return FREIGHT;
  // rebalance: set Blue to blueWeight, scale the others to fill the rest
  const others = FREIGHT.filter((f) => f.key !== "Blue");
  const otherSum = others.reduce((s, f) => s + f.weight, 0);
  const remaining = 100 - blueWeight;
  return FREIGHT.map((f) =>
    f.key === "Blue" ? { ...f, weight: blueWeight } : { ...f, weight: (f.weight / otherSum) * remaining }
  );
}

function pickFreight(table) {
  const t = table || FREIGHT;
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const f of t) {
    cursor += f.weight;
    if (roll <= cursor) return f;
  }
  return t[0];
}

window.WFC_CONFIG = { GAME, FONTS, PAL, CSS, FREIGHT, TUNE, LAYOUT, ZONES, ASSIGNMENT_LABELS, WORKER_SHEET, RC_SHEET, ROSTER_NAMES, GLOSSARY, SCENARIOS };
