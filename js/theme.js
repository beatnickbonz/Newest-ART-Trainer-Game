/* =============================================================================
 * Warehouse Flow Commander — THEME TOKENS
 *
 * Single source of truth for the rebuild's visual language: palette, type
 * scale, spacing, radii, elevation, depth bands, and motion timings.
 * Phase 1 (docs/ART_DIRECTION.md) locks the values; Phases 2/4 make world.js,
 * ui.js, and style.css read exclusively from here. Until then this module is
 * additive — nothing consumes it yet.
 *
 * Conventions:
 *   - Colors carry both forms: `hex` (0x… for Phaser tints/fills) and `css`.
 *   - Scales are arrays/maps, not one-off constants — pick from the scale.
 *   - Motion tokens pair a duration (ms) with an ease usable in Phaser tweens.
 * ===========================================================================*/

const THEME = {
  /* ---------- palette: semantic first, raw second ----------
   * BRIGHT MODERN FACILITY (ART_DIRECTION.md v2): light world, dark slate text,
   * frosted-light UI. Saturation budget belongs to freight bands + zone paint. */
  color: {
    /* surfaces, lightest → deepest (high-key facility) */
    surface: [
      { hex: 0xf6f8f9, css: "#f6f8f9" }, // 0 skylight white / panel top
      { hex: 0xe8ecee, css: "#e8ecee" }, // 1 wall panel / frosted UI base
      { hex: 0xdde2e5, css: "#dde2e5" }, // 2 floor bright field
      { hex: 0xcfd4d8, css: "#cfd4d8" }, // 3 floor base concrete
      { hex: 0xaeb6bc, css: "#aeb6bc" }, // 4 recessed / joints / underside
    ],
    line: { hex: 0x94a3ad, css: "#94a3ad" },       // hairlines, frames on light ground
    steel: { hex: 0x64748b, css: "#64748b" },      // galvanized columns, door frames
    paint: { hex: 0xffffff, css: "#ffffff" },      // keep-clear hatching

    text: {
      ink: { hex: 0x0f172a, css: "#0f172a" },      // headings on light panels
      body: { hex: 0x1e293b, css: "#1e293b" },
      dim: { hex: 0x475569, css: "#475569" },
      muted: { hex: 0x64748b, css: "#64748b" },
      onDark: { hex: 0xf4f8fa, css: "#f4f8fa" },   // inside saturated chips only
    },

    /* brand */
    brand: { hex: 0xf59e0b, css: "#f59e0b" },      // amber — operator/RC identity, actions
    brandDeep: { hex: 0xb45309, css: "#b45309" },
    accent: { hex: 0x0ea5e9, css: "#0ea5e9" },     // cyan — information/primary dock
    accentAlt: { hex: 0x8b5cf6, css: "#8b5cf6" },  // violet — secondary dock

    /* teaching-state colors (flow health, alert severities) — deepened for light bg */
    state: {
      good: { hex: 0x059669, css: "#059669" },
      warn: { hex: 0xd97706, css: "#d97706" },
      bad: { hex: 0xe11d48, css: "#e11d48" },
      info: { hex: 0x0284c7, css: "#0284c7" },
    },

    /* freight hues live in config.view.js (FREIGHT_COLORS) — they are a
     * teaching signal with their own legibility/colorblind constraints and
     * will be finalized in the Phase 1 art direction spec. */
  },

  /* ---------- typography ---------- */
  font: {
    display: "Oswald",              // headings, big numerals, zone stencils
    ui: "Barlow Semi Condensed",    // labels, body, buttons
    scale: { xs: 10, sm: 11, base: 13, md: 15, lg: 18, xl: 24, xxl: 34, hero: 48 },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    tracking: { tight: 0, label: 0.5, stencil: 2 }, // letter-spacing px
  },

  /* ---------- spacing / geometry ---------- */
  space: [0, 2, 4, 8, 12, 16, 24, 32, 48, 64], // 4-ish scale, index by need
  radius: { xs: 2, sm: 4, md: 8, lg: 12, pill: 999 },
  touchTarget: 44, // px minimum for tablet (rebuild plan Phase 4)

  /* ---------- elevation ---------- */
  shadow: {
    /* soft blob under actors/pallets (Phaser: ellipse fill) — short + light for daylight */
    blob: { hex: 0x334155, alpha: 0.2 },
    /* panel drop (css) + Phaser approximation */
    panel: { css: "0 6px 18px rgba(15,23,42,.18)", hex: 0x334155, alpha: 0.18, offsetY: 6 },
    glowStrength: 0.6, // haulable-pallet / ready-lane emphasis, 0..1
  },

  /* ---------- renderer depth bands (setDepth) ---------- */
  depth: {
    floor: 0,
    paint: 5,
    zoneFrame: 8,
    shadows: 10,
    // 11..719: dynamic actors sort by sim-space y (worker/RC/pallet stacks)
    fxLow: 720,     // ground fx: gpm sweep, drop dust
    wall: 750,      // back wall + dock doors render above floor actors
    fxHigh: 800,    // pops, bursts, celebrations
    ui: 1000,       // HUD/panels
    modal: 2000,    // pause/glossary overlays
  },

  /* ---------- motion ---------- */
  motion: {
    /* durations (ms) */
    tick: 90,        // sprite frame cadence baseline
    snap: 120,       // hover/press feedback
    quick: 200,      // toasts in, meter changes
    move: 350,       // panel slides, card flips
    drop: 450,       // pallet drop settle
    celebrate: 700,  // lane-complete burst
    grade: 1200,     // flow-health environmental mood cross-fade
    /* eases (Phaser tween strings) */
    ease: {
      out: "Cubic.easeOut",
      inOut: "Cubic.easeInOut",
      pop: "Back.easeOut",
      drop: "Bounce.easeOut",
      pulse: "Sine.easeInOut",
    },
  },
};

window.THEME = THEME;
