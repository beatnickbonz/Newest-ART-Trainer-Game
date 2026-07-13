/* =============================================================================
 * Warehouse Flow Commander — GAMEPLAY CONFIG (FROZEN)
 *
 * Everything in this file is part of the frozen sim contract
 * (docs/SIM_CONTRACT.md) and is guarded by tests/harness.html golden snapshots.
 * Do NOT edit values here as part of visual work. If a mechanic must change,
 * that is an explicit, snapshot-regenerating task (rebuild plan, Phase 5+).
 *
 * FROZEN here:
 *   - TUNE (incl. scores), FREIGHT keys/labels/weights, SCENARIOS, GLOSSARY
 *   - Sim-space geometry: ZONES x/y/w/h/assignment + the position helpers.
 *     The sim moves workers and the RC through these coordinates at fixed
 *     px/sec speeds, so distance = time = throughput = score. The renderer
 *     must PROJECT sim-space to screen-space; it may not move these.
 *   - SimRNG seam (unseeded = Math.random; the harness seeds it)
 *
 * Presentation props (freight colors, zone labels/colors/icons) are attached
 * onto these same objects by config.view.js at load — that half is free.
 * ===========================================================================*/

/* Freight mix. weight = spawn probability %, must sum to 100.
 * "Blue" is special: it routes to the IBT lane, not shared staging.
 * color/css are decorated by config.view.js (hues are presentation). */
const FREIGHT = [
  { key: "Brown", label: "Standard", weight: 38 },
  { key: "Red", label: "Priority", weight: 22 },
  { key: "Orange", label: "Hazmat", weight: 16 },
  { key: "Purple", label: "Oversize", weight: 14 },
  { key: "Blue", label: "Transfer", weight: 10 },
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

  /* Flow-health pressure weights (extracted from updateFlowHealth in Phase 5 —
   * values and evaluation order unchanged; behavior identical). Tuning the core
   * loop is now data, not code. */
  flowWeights: {
    lineBacklog: 1.35,   // per box waiting on either inbound line
    fullPallet: 2.4,     // per unhauled full pallet
    blockedBase: 5,      // per blocked base
    needEmpty: 4,        // per base waiting on an empty pallet
    mixedLane: 7,        // per mixed staging lane
    ibtFull: 18,         // IBT at capacity
    ibtHigh: 8,          // IBT at/above ibtHighAt
    ibtHighAt: 8,
    artDry: 12,          // per side sitting on a dry ART source
    idleCrew: 6,         // scaled by (1 - utilization)
  },

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

/* ---------- FROZEN sim-space geometry ----------
 * Zone x/y/w/h and `assignment` are read by the sim (worker/RC pathing).
 * config.view.js decorates each zone with label/color/icon for the renderer;
 * those visual fields are NOT part of the contract. Sim-space spans 1280×720.
 *
 * LAYOUT v2 (2026-07-03, explicit user-approved geometry change — golden
 * snapshots regenerated): service bays (empty-pallet trailer, IBT) moved to the
 * two center dock doors; RAA prep tucked under each dock's second (RAA-supply)
 * door; primary/secondary work areas + staging moved down; inbound conveyors
 * run VERTICALLY from the ART door (primary feeds from the LEFT door x=300,
 * secondary from the RIGHT door x=980). */
const ZONES = [
  // v2.1: docks are vertical strips — full-height conveyor + a 1-column rank of
  // 5 build stations beside it (primary builds RIGHT of its belt, secondary LEFT)
  { id: "primary", assignment: "primary", x: 340, y: 440, w: 180, h: 390 },
  { id: "secondary", assignment: "secondary", x: 940, y: 440, w: 180, h: 390 },
  { id: "staging", assignment: "staging", x: 640, y: 440, w: 242, h: 250 },
  { id: "raaPrimary", assignment: "raaPrimary", x: 404, y: 205, w: 150, h: 70, noWorkerAssignment: true },
  { id: "raaSecondary", assignment: "raaSecondary", x: 876, y: 205, w: 150, h: 70, noWorkerAssignment: true },
  { id: "primaryStack", assignment: "primaryStack", x: 470, y: 604, w: 92, h: 64, noWorkerAssignment: true },
  { id: "secondaryStack", assignment: "secondaryStack", x: 810, y: 604, w: 92, h: 64, noWorkerAssignment: true },
  { id: "emptyTrailer", assignment: "emptyTrailer", x: 600, y: 205, w: 80, h: 80, noWorkerAssignment: true },
  { id: "ibt", assignment: "ibt", x: 690, y: 205, w: 80, h: 80, noWorkerAssignment: true },
];

/* Vertical inbound conveyor anchors: the belt drops from each dock's ART door
 * (sim-space x of the feeding door). Workers pick at the head (bottom end). */
const LINE_X = { primary: 300, secondary: 980 };

const ZONE_BY = {};
ZONES.forEach((z) => { ZONE_BY[z.assignment] = z; });

function zoneOf(assignment) { return ZONE_BY[assignment]; }

/* v2.2: one vertical rank of build stations beside the belt — primary's rank
 * sits RIGHT of its conveyor, secondary's LEFT (mirrored toward center), with a
 * worker PICK CORRIDOR between belt and stations. Workers live in the corridor
 * (pick point + idle spots); the RC approaches stations from the OUTER side. */
const PICK_DX = { primary: 38, secondary: -38 };   // corridor centerline offset from belt
function basePos(sideKey, index) {
  return {
    x: LINE_X[sideKey] + (sideKey === "primary" ? 92 : -92),
    y: 285 + index * 80,
  };
}
/* RC pickup approach: outer side of the station, clear of the corridor. */
function rcBasePos(sideKey, index) {
  const p = basePos(sideKey, index);
  return { x: p.x + (sideKey === "primary" ? 46 : -46), y: p.y };
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

/* Inbound conveyor line: a full-height VERTICAL belt dropping from the ART door
   almost to the bottom of the floor. Boxes ride down and queue toward the pick
   head at the bottom end; workers pick there and carry to the station rank. */
const LINE_VISIBLE = 6;
/* Pick point sits IN the corridor beside the belt's bottom end. */
function lineHeadPos(sideKey) {
  return { x: LINE_X[sideKey] + PICK_DX[sideKey], y: 570 };
}
/* Renderer-only (not called by the sim; free to rewrite): boxes spread up the
   belt from the pick end toward the door — front of the queue at the bottom. */
function lineSlotPos(sideKey, i) {
  return { x: LINE_X[sideKey], y: 545 - (i % LINE_VISIBLE) * 66 };
}
/* Idle workers wait spread along the pick corridor. */
function restPos(sideKey, i) {
  return { x: LINE_X[sideKey] + PICK_DX[sideKey], y: 330 + (i % 3) * 90 };
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

/* Sim-affecting randomness goes through this seam so the regression harness can
 * seed it. Unseeded (production) it is plain Math.random. Visual randomness in
 * world.js/textures.js must keep using Math.random directly. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SimRNG = {
  _fn: null,
  seed(n) { this._fn = mulberry32(n >>> 0); },
  unseed() { this._fn = null; },
  random() { return this._fn ? this._fn() : Math.random(); },
};

function rint(min, max) { return Math.floor(min + SimRNG.random() * (max - min + 1)); }

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
  const roll = SimRNG.random() * 100;
  let cursor = 0;
  for (const f of t) {
    cursor += f.weight;
    if (roll <= cursor) return f;
  }
  return t[0];
}
