/* =============================================================================
 * Warehouse Flow Commander — VIEW CONFIG (free to rewrite)
 *
 * Presentation half of the old config.js: canvas size, palette, fonts, panel
 * layout, sprite sheets, and the visual decoration of the frozen gameplay
 * objects (freight hues, zone labels/colors/icons). The rebuild (Phases 1-4)
 * may rewrite anything in this file. Loads AFTER config.gameplay.js.
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

/* Text palette for scene chrome — flipped to dark-slate-on-light in Phase 6.
 * Names kept for call-site compatibility: `white` = strongest emphasis (now
 * near-black ink), semantic colors deepened for light backgrounds. */
const CSS = {
  text: "#1e293b",
  textDim: "#475569",
  muted: "#64748b",
  amber: "#b45309",
  cyan: "#0369a1",
  green: "#059669",
  red: "#e11d48",
  yellow: "#a16207",
  white: "#0f172a",
  ink: "#f6f8f9",
};

/* Freight hues (visual decoration of the frozen FREIGHT table). Color = the
 * core teaching signal — keep hues legible and distinct. These may be retuned
 * (colorblind-safe pass planned) without touching gameplay. */
const FREIGHT_COLORS = {
  Brown: { color: PAL.brown, css: "#b8854f" },
  Red: { color: PAL.red, css: "#fb7185" },
  Orange: { color: PAL.orange, css: "#fdba74" },
  Purple: { color: PAL.purple, css: "#c4b5fd" },
  Blue: { color: PAL.blue, css: "#93c5fd" },
};
FREIGHT.forEach((f) => Object.assign(f, FREIGHT_COLORS[f.key]));

/* Zone chrome (visual decoration of the frozen sim-space ZONES). */
const ZONE_STYLE = {
  primary: { label: "PRIMARY DOCK", color: PAL.cyan, icon: "box", chipless: true },
  secondary: { label: "SECONDARY DOCK", color: PAL.purple, icon: "box", chipless: true },
  staging: { label: "SHARED STAGING", color: PAL.green, icon: "forklift" },
  raaPrimary: { label: "P · RAA PREP", color: PAL.yellow, icon: "crate" },
  raaSecondary: { label: "S · RAA PREP", color: PAL.yellow, icon: "crate" },
  primaryStack: { label: "P EMPTIES", color: PAL.brown, icon: "handtruck" },
  secondaryStack: { label: "S EMPTIES", color: PAL.brown, icon: "handtruck" },
  emptyTrailer: { label: "EMPTY TRAILER", color: PAL.brown, icon: "truck" },
  ibt: { label: "IBT TRANSFER", color: PAL.blue, icon: "warehouse" },
};
ZONES.forEach((z) => Object.assign(z, ZONE_STYLE[z.id]));

/* ---------- Layout: full-bleed world + floating glass panels ---------- */
const LAYOUT = {
  world: { x: 0, y: 0, w: GAME.W, h: GAME.H },
  panels: {
    hud: { x: 0, y: 0, w: GAME.W, h: 62 },
    roster: { x: 12, y: 74, w: 190, h: 506 },
    ops: { x: 1078, y: 74, w: 190, h: 506 },
    command: { x: 0, y: 662, w: GAME.W, h: 58 },
  },
  /* dock doors along the back wall. Index 0 of primary/secondary = the ART
   * (feeding) door — primary feeds from the LEFT, secondary from the RIGHT;
   * index 1 = the RAA-supply door with the prep area below it. */
  dockWall: { y: 60, h: 96 },
  doors: {
    primary: [{ x: 300, y: 104 }, { x: 404, y: 104 }],
    secondary: [{ x: 980, y: 104 }, { x: 876, y: 104 }],
    empty: [{ x: 600, y: 104 }],
    ibt: [{ x: 690, y: 104 }],
  },
};

const ASSIGNMENT_LABELS = {
  idle: "Idle",
  primary: "Primary Dock",
  secondary: "Secondary Dock",
  staging: "RC Operator",
  floater: "Floater",
};

/* Painted atlases (tools/process_assets.py → assets/painted*Data.js).
 * BootScene loads every entry of window.PAINTED_DATA with key prefix "p_".
 * Frame indices below match the row-major slice order of each sheet. */
const PAINTED_SCALE = {
  worker: 0.48,        // 100×180 strip → ~48×86 on floor
  rc: 0.44,            // 296×194 strip → forklift ~85 tall
  pallets: 0.36,       // base build positions
  lanePallet: 0.20,    // staged pallets in lanes
  carton: 0.27,        // inbound line + carried boxes
  door: 0.335,         // 248×304 door units → ~83×102 wall openings
  empties: 0.30,       // empty-pallet stacks
};
const WORKER_KEYS = ["p_worker_A", "p_worker_B", "p_worker_C", "p_worker_D"];
const PALLET_F = { empty: 0, stack: 1, b2: 2, b4: 3, l2: 4, l3: 5, full: 6, wrapped: 7 };
const DOOR_F = { closed: 0, third: 1, twothirds: 2, open: 3, docked: 4 };
const DRESSING_F = { rack: 0, cone: 1, table: 2, handtruck: 3, strip: 4, gauge: 5, trailer: 6, charger: 7 };

const ROSTER_NAMES = ["Avery", "Blake", "Casey", "Drew", "Emery", "Frankie"];

function formatTime(ms) {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(safe / 60);
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

window.WFC_CONFIG = { GAME, FONTS, PAL, CSS, FREIGHT, TUNE, LAYOUT, ZONES, ASSIGNMENT_LABELS, PAINTED_SCALE, WORKER_KEYS, ROSTER_NAMES, GLOSSARY, SCENARIOS, SimRNG };
