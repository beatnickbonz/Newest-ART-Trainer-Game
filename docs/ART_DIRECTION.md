# Art Direction — Warehouse Flow Commander rebuild (v2)

**Status:** proposed (Phase 1 redo) — the style-anchor hero image (ASSET_PLAN.md, prompt 0)
is the approval artifact. v1 (dark procedural "third shift" direction) was reviewed and
**abandoned** 2026-07-03; do not resurrect it.
**Approved constraints:** AI-painted asset pipeline · bright modern facility mood ·
keep soft 2.5D · new sprite set (Path B) · freight hues free to change · desktop + tablet.

---

## 1. The premise: "flagship facility, first hour of day shift"

A brand-new cross-dock the company shows to visitors: light sealed-concrete floor,
white wall panels and skylights, daylight everywhere, crisp safety-color paint. The
floor reads like a well-organized diagram *because the facility is genuinely that
clean* — clarity is diegetic. Freight cartons and staging lanes are the most saturated
things in frame, so the teaching signal owns the color budget. Amber stays the
operator-identity color (forklift livery, action buttons, haulable glow); slate/cyan
carries information.

## 2. Pipeline (how the look is actually produced)

- **Painted assets, generated externally.** The user generates PNG sheets with an image
  AI from the prompts in `docs/ASSET_PLAN.md`. Every prompt shares the same master
  style block; the approved hero image is attached as a style reference to every
  subsequent generation for consistency.
- **Processing (me, Python/Pillow):** background strip (flood-fill + color-aware
  de-fringe + 1px erosion — the proven v6 pipeline), gap-bounded cell slicing,
  feet/base-aligned repacking into uniform grids, downscale to target, embed as data
  URIs (`assets/*Data.js`). No external image files at runtime — `file://` must keep
  working.
- **Runtime composition (Phaser):** painted sprites/atlases + procedural light and
  shadow on top (contact shadows, door light shafts, mood grade, FX). Paint provides
  material richness; code provides state changes and motion.
- Raw generations are kept in `assets/raw/` (not shipped, not embedded).

## 3. Camera & projection (unchanged technical contract)

- **Identity projection:** screen = sim-space (1280×720), depth-sort by `y`. 2.5D comes
  from how assets are painted (consistent ~60° overhead three-quarter view), never from
  skewing coordinates. One `project(x, y)` seam in the renderer for future flexibility.
- **Every generation prompt pins the same camera and light:** top-down three-quarter
  view, key light high and slightly front-left, soft neutral shadows directly under
  objects. Consistency here is what makes separate generations sit in one world.

## 4. Palette & materials (bright, high-key)

| Element | Treatment |
| --- | --- |
| Floor | Light sealed concrete `#cfd4d8` → `#dde2e5`, subtle sheen, faint expansion joints; slightly warm under skylights |
| Zone paint | Saturated safety paint on light ground: **amber `#f59e0b`** RC-action zones, **cyan `#0ea5e9`** primary dock, **violet `#8b5cf6`** secondary dock, hatched white keep-clear aisles |
| Walls | White insulated panel + galvanized column silhouettes, high skylight band; dock doors are light-grey segmented shutters with colored status lamps |
| Cartons | Kraft board with a bold colored band + route icon (§5); kraft stays neutral so the band pops |
| Pallets | Pale new wood; wrapped full pallets get bright stretch-wrap sheen + amber "haul me" pulse |
| UI | Frosted-light glass panels, dark slate text `#1e293b`, amber primary actions — modern training-app chrome (Phase 4) |

Text/UI contrast flips from the old build: dark-on-light everywhere except inside
saturated chips.

## 5. Freight color language (on light ground)

Deeper, saturated hues (pastels die on a bright floor), colorblind-checked, each with a
baked secondary mark on carton band and lane chip:

| Key | Role | Hue | css | Secondary mark |
| --- | --- | --- | --- | --- |
| Brown | Standard | saddle tan | `#a16207` | plain band |
| Red | Priority | crimson-magenta | `#e11d48` | double chevron » |
| Orange | Hazmat | safety orange | `#ea580c` | diagonal hazard stripe |
| Purple | Oversize | deep violet | `#7c3aed` | wide bracket ⟨⟩ |
| Blue | Transfer (IBT) | azure | `#0284c7` | route arrow → |

Keys/labels/weights in `config.gameplay.js` untouched; only `FREIGHT_COLORS` + carton
art change. Final values get checked against the hero image before Phase 2 lock.

## 6. Lighting model (high-key version)

1. **Ambient:** bright neutral daylight; shadows soft, short, cool-tinted.
2. **Skylight pools:** slightly *warmer + brighter* rectangles over work zones (subtle —
   maybe 8% lift; on a light floor, pools guide the eye by warmth, not brightness).
3. **Door spill:** open doors read via exterior brightness + trailer presence; weather
   variants (`day/dawn/dusk/night`) tint the exterior seen through doors and the spill
   wedge — the *interior stays bright* in all scenarios (it's a lit facility).
4. **Mood grade (flow health):** healthy = clean daylight; strained = warm sodium tint
   creeping in from edges + zone paint saturating; critical = red wall strips breathing
   + slight global desaturation (~12%) + vignette. Graded cross-fades over
   `THEME.motion.grade`, never a flat flash.
5. **Practicals:** door status lamps, forklift amber beacon while hauling, IBT end-cap.

## 7. Motion language (unchanged from v1 — tokens in `js/theme.js`)

Haul pickup tilt-and-lift · drop settle with dust ring · lane-complete light sweep +
label flare · GPM truck silhouette sweep · trailer dock-in through rolling door ·
severity-tinted toasts · sparse idle life (≤2 ambient events / 10s).

## 8. Readability rules (non-negotiable, unchanged)

At arm's length on a tablet, each reads in **<1 second**:

1. **Base fill:** carton course count + 6-segment pip strip on the base frame.
2. **Full/blocked:** wrapped pallet + amber pulse = haulable; red chevron tape = blocked/waiting-empty.
3. **Lane state:** clean = solid chip + count; mixed = black/yellow hazard diagonals; ready = pulse + "READY" stencil.
4. **IBT level:** vertical gauge with capacity notch; clearing animates down.
5. **RAA state:** prepped pallets physically staged + dry-warning lamp.
6. **Trailer offer:** manifest card, blue% as the dominant numeral + proportion bar.
7. **Flow health:** HUD gauge and environmental grade always agree.
8. Freight color is **never** the only encoding (§5 marks).

Any visual idea that fights one of these eight loses, no matter how good it looks.

## 9. Sprites (Path B, painted, for Phase 3)

Same painted style as the environment: workers in light hi-vis over grey workwear,
colored hard hats per character; forklift in amber-and-white livery. **Frame semantics
frozen** so renderer logic survives: per worker character — front idle ×3, side-walk ×7,
back ×3, carry ×5 (the v6 layout); RC — empty/loaded × both facings. Grid-with-gaps
sheet layout for the Pillow slicer (details in ASSET_PLAN.md).
