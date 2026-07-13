# Asset Plan — AI-painted pipeline (Phase 1 → 3)

**How this works:**
1. You run these prompts in your image AI (order matters — prompt 0 first).
2. Save results as PNG into `assets/raw/` with the given filenames (any resolution ≥2048
   on the long side is great; don't compress).
3. Tell me they're in. I strip/slice/align/pack with the Pillow pipeline, embed as data
   URIs, and wire them into the renderer.
4. **Prompt 0's output is the Phase 1 approval artifact.** Once you like one, we attach
   it as the style reference image to every later generation (most tools: image
   reference / style reference / `--sref`). Regenerate 0 until it feels right — nothing
   else should be generated before it's locked.

**Rules that make the pipeline work (already baked into the prompts):**
- Same camera in every prompt: top-down three-quarter view (~60° from horizontal).
- Same light: soft daylight from high front-left, short soft shadows directly under objects.
- Props/sprites on a **flat dark charcoal background** (easy to key out under light assets).
- Grid sheets need **generous empty gaps** between items — my slicer uses the gaps.
- No text, no logos, no watermarks in any asset.

---

## Master style block (prefix for EVERY prompt below)

```
Clean stylized 2.5D video game art, painted digital illustration style, bright modern
logistics facility aesthetic: light sealed concrete, white wall panels, crisp saturated
safety-color accents (amber, cyan, violet), soft neutral daylight from high front-left,
short soft shadows, top-down three-quarter camera view at about 60 degrees. Polished
indie game quality, coherent material rendering, no outlines, no text, no watermark.
```

---

## 0 — `hero_anchor.png` · STYLE ANCHOR (generate first, approve, lock)

Aspect 16:9.

```
[master style block] Wide interior view of a bright modern cross-dock warehouse floor
in a flagship logistics facility: light sealed-concrete floor with painted safety
zones (amber-outlined staging lanes in the center, a cyan-outlined dock apron on the
left, a violet-outlined dock apron on the right), white insulated wall panels with a
row of grey segmented dock shutter doors along the back wall, one door open with a
white box trailer docked and bright daylight spilling in, skylight band in the
ceiling. On the floor: wooden pallets stacked with kraft cardboard boxes that have
bold colored bands (azure, crimson, safety orange, violet, tan), one pallet wrapped
in translucent plastic stretch wrap, a small amber-and-white electric forklift
carrying a wrapped pallet, two warehouse workers in light hi-vis vests and colored
hard hats carrying boxes. Everything tidy, new, and brightly lit — a showcase
facility. Video game environment concept art, 16:9.
```

Approval checklist (what I'll ask you to judge): does the *floor+paint* read clean? Do
the *colored carton bands* pop as the most saturated thing? Does the light feel like
daylight? Do you want to live in this warehouse for six scenarios?

---

## 1 — Environment sheets

### 1a `floor_tile.png` — square
```
[master style block] Seamless tileable texture of light sealed polished concrete
warehouse floor, very subtle expansion joints and faint tire scuffs, slightly warm
daylight sheen, high-key light grey, square format, flat orthographic top-down view,
seamless repeating pattern.
```

### 1b `dock_doors.png` — grid sheet, 16:9
```
[master style block] Game asset sprite sheet on a flat dark charcoal background,
arranged in a neat single row with wide empty gaps: five variations of the same grey
segmented industrial roller shutter dock door set into a white insulated wall panel
with steel frame — (1) fully closed, (2) one-third rolled up, (3) two-thirds rolled
up, (4) fully open showing bright daylight outside, (5) fully open with the front of
a white box trailer docked in the opening. Identical size and framing for all five,
front-facing orthographic view, small colored status lamp above each door.
```

### 1c `conveyor.png` — grid sheet, square
```
[master style block] Game asset sprite sheet on a flat dark charcoal background, neat
grid with wide empty gaps: modular grey roller conveyor segments for a warehouse —
(1) straight belt segment, (2) belt end/head unit with side guards, (3) support leg
detail. Top-down three-quarter view, consistent scale.
```

## 2 — Prop sheets

### 2a `pallets.png` — grid sheet, square (the workhorse sheet)
```
[master style block] Game asset sprite sheet on a flat dark charcoal background, neat
grid with wide empty gaps, identical scale and camera for every item: pale new wooden
warehouse pallets — (1) empty pallet, (2) neat stack of five empty pallets, then the
same pallet loaded with kraft cardboard boxes at increasing fill levels: (3) two
boxes, (4) four boxes in one layer, (5) two layers of boxes, (6) full cube of boxes
three layers tall, (7) the full cube wrapped tightly in translucent white plastic
stretch wrap with sheen. Top-down three-quarter view.
```

### 2b `cartons.png` — grid sheet, square
```
[master style block] Game asset sprite sheet on a flat dark charcoal background, neat
grid with wide empty gaps: single kraft cardboard shipping boxes, same size and
camera — (1) plain kraft box, (2) kraft box with a wide plain WHITE horizontal band
around it, (3) same banded box rotated 45 degrees, (4) small stack of two banded
boxes. The band must be pure flat white with no markings (it gets tinted in-engine).
Top-down three-quarter view.
```

### 2c `dressing.png` — grid sheet, square
```
[master style block] Game asset sprite sheet on a flat dark charcoal background, neat
grid with wide empty gaps, consistent scale: warehouse dressing props — (1) low steel
pallet rack bay with a few kraft boxes, (2) orange safety cone, (3) grey steel prep
table, (4) hand truck / two-wheel dolly, (5) wall-mounted red emergency light strip,
(6) vertical level gauge post with a colored indicator bar, (7) small white box
trailer seen from the front, (8) forklift charging station. Top-down three-quarter
view.
```

## 3 — Sprite sheets (Phase 3, generate after environment is integrated)

Frame semantics are FROZEN (renderer contract). One character per generation.

### 3a×4 `worker_A.png` … `worker_D.png` — one row-grid sheet per character
```
[master style block] Game character sprite sheet on a flat dark charcoal background:
ONE warehouse worker character repeated in a neat grid with wide empty gaps, identical
scale, full body, feet visible, consistent proportions (slightly chunky, about 2.5
heads tall), wearing a light hi-vis vest over grey workwear and a {YELLOW|CYAN|GREEN|RED}
hard hat. Row 1: three frames standing facing the camera (subtle idle variation).
Row 2: seven frames of a side-view walk cycle facing right. Row 3: three frames
walking away from camera (back view). Row 4: five frames of a side-view walk cycle
facing right while carrying a kraft cardboard box with both hands. Flat colors, clean
silhouette, game sprite style.
```
(One generation per hard-hat color → A yellow, B cyan, C green, D red. 18 frames each,
matching the v6 layout: front 0-2 / side-walk 3-9 / back 10-12 / carry 13-17.)

### 3b `rc_operator.png` — row-grid sheet
```
[master style block] Game vehicle sprite sheet on a flat dark charcoal background:
a small amber-and-white electric sit-down forklift with an operator in a light
hi-vis vest and white hard hat, repeated in a neat single row with wide empty gaps,
identical scale, side view facing right — (1) forks empty and lowered, (2) forks
raised slightly carrying a wooden pallet wrapped in translucent stretch wrap with
kraft boxes inside. Clean silhouette, game sprite style.
```
(Two frames × mirrored at runtime = the current 4-frame semantics.)

---

## Processing specs (mine, for reference)

- Strip: flood-fill charcoal bg → alpha, color-aware de-fringe (dark edge variant),
  1px MinFilter erosion.
- Slice: gap-bounded cell detection; repack base-aligned (props) / feet-aligned
  (characters) into uniform grids; record frame dims into `config.view.js` sheets.
- Downscale to in-game scale ×2 (retina headroom), embed via `assets/*Data.js`
  (`window.*_DATA` data URIs), raw files stay in `assets/raw/` unshipped.
- Carton band tinting: band painted white → runtime `setTint` with `FREIGHT_COLORS`;
  secondary marks (chevron/stripe/bracket/arrow) drawn as tiny procedural overlays so
  hues stay swappable.
