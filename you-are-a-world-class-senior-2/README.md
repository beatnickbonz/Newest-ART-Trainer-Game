# Warehouse Flow Commander 2.0

A full, browser-based **RTS warehouse-operations training game** built on Phaser 3.
You command a fulfillment-center receive dock as a *flow leader*: assign labor,
manage freight sources, route the forklift RC operator, and keep flow health green
across a graded shift. Rebuilt from the ground up from the original prototype with a
polished 2.5D presentation, a campaign, an interactive tutorial, audio, and a clean
multi-scene engine.

## Editions

There are two playable editions that share the same engine and art:

- **Original — "Flow Leader"** (this folder, `index.html`): you are the shift
  manager. Assign a roster of workers to docks and the RC role, and keep flow green.
- **RC Operator** (`v2/index.html`): **you ARE the RC forklift operator.** Workers
  auto-spawn and physically shuttle boxes from each dock's inbound line to the bases;
  you click full pallets to haul them (blue auto-routes to IBT), accept or reject
  incoming **trailer manifests** by their freight mix, reassign crew between docks, and
  ship partials. Primary dock controls sit on the **left**, secondary on the **right**.
  This edition focuses the training on the RC's moment-to-moment decisions.

Run the RC Operator edition with its own server (it shares `../assets`):

```powershell
powershell -ExecutionPolicy Bypass -File v2/serve.ps1 -Port 8124
# then open http://localhost:8124
```

## Run

The game is fully self-contained (sprites and icons are embedded; only Phaser, the
web fonts, and the icon CDN are loaded online the first time). Open `index.html` in a
modern browser, or serve the folder:

```powershell
# Windows (no Node/Python needed) — a tiny built-in static server:
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8123
# then open http://localhost:8123
```

`.claude/launch.json` is wired so the Claude Code preview can launch the same server.

## What you do

- **Select an associate** (roster on the left, or keys `1`–`6`) and **click a zone** to post them: Primary Dock, Secondary Dock, RC Operator (shared staging), or Floater.
- Posted dock workers turn **inbound freight** into pallets on color-coded **bases**. A full base (6 boxes) must be pulled by the **RC operator**.
- The **RC operator** (forklift) auto-hauls full pallets to **staging lanes**, runs **blue Transfer** freight to **IBT**, preps **RAA** backup, and restocks **empty pallets**.
- Three matching pallets complete a clean **staging lane**; mixing colors jams it.
- When a dock's **ART** trailer empties, switch its **source to RAA** backup or **request a new trailer** — pre-build RAA before you run dry.
- Keep **flow health** green. Inbound backlog, blocked bases, full pallets, mixed lanes, and dry sources all drag it down.

## Game modes

- **Campaign** — 6 escalating shifts, each training a different skill, with briefings, objectives, 1–3 star ratings, and unlock progression (saved to `localStorage`):
  1. **First Shift** (training) · 2. **Trailer Surge** (volume) · 3. **Short-Staffed** (labor) · 4. **Blue Freight Spike** (IBT) · 5. **RAA Crunch** (sourcing) · 6. **Peak Day** (boss).
- **Free Shift** — open practice, no campaign pressure.
- **Tutorial** — a gated, interactive onboarding overlaid on a live shift.
- **Glossary** — always-available reference for every floor term (ART, RAA, RC, GPM, IBT, …).

## Controls

| Action | Key | Action | Key |
| --- | --- | --- | --- |
| Select worker 1–6 | `1`–`6` | Source toggle P / S | `Q` / `W` |
| Request ART P / S | `A` / `S` | Clear IBT | `E` |
| Rework mixed lane | `R` | Call GPM (emergency) | `G` |
| Glossary | `T` | Pause | `Space` |
| Mute | `M` | | |

Every command also has a labeled, tooltipped button in the bottom command bar.

## Architecture

Plain global scripts (no bundler), loaded in dependency order from `index.html`:

| File | Responsibility |
| --- | --- |
| `js/config.js` | Design system (palette, fonts), layout geometry, tuning, freight, glossary, **campaign scenarios**, shared layout helpers |
| `js/save.js` | `localStorage` progress, stars, unlocks, settings |
| `js/audio.js` | Web Audio synth — UI/floor SFX + ambient bed (no audio files) |
| `js/textures.js` | Procedural Canvas2D textures (soft shadows, light pools, concrete, brushed metal, 2.5D freight boxes, pallets, trailer, vignette) + icon rasterization |
| `js/sim.js` | Phaser-free simulation: state, workers, flow, staging, scoring, alerts, objective evaluation |
| `js/world.js` | `WorldRenderer` — polished 2.5D warehouse, animated dock doors/trailers, lighting, shadows, particle FX |
| `js/ui.js` | `UIManager` — glass HUD, flow gauge, roster cards, ops panels, command bar, toasts, tooltips, score pops |
| `js/tutorial.js` | Gated interactive onboarding controller |
| `js/scenes.js` | Boot, Menu, Scenario Select, Briefing, Game, Results, Pause/Glossary/Credits |
| `js/main.js` | Web-font-gated Phaser bootstrap |

The simulation is deliberately decoupled from rendering: `world.js` and `ui.js` only
*read* `sim` state, so the game logic is testable and the visuals are replaceable.

## Assets & licenses

- **Engine:** Phaser 3.80 — MIT.
- **Fonts:** Oswald + Barlow Semi Condensed (Google Fonts, SIL OFL).
- **Icons:** [game-icons.net](https://game-icons.net) by Delapouite & Lorc — **CC BY 3.0**. Fetched, background-stripped, embedded in `assets/iconData.js`, and tinted at runtime.
- **Worker & forklift sprites:** the provided sheets (`assets/worker_sprites_v2.png`, `assets/rc_operator_sprites.png`), embedded as data URIs for reliable local loading.
- **Everything else** (warehouse, trailers, freight, pallets, lighting, UI chrome) is procedurally generated.
- **Audio:** fully synthesized in-browser via the Web Audio API.

Credits and licenses are also shown in-game under **Credits**.

## Tuning

Gameplay values live in `TUNE` in `js/config.js`; each scenario overrides a subset via
its `tune` block (shift length, spawn rates, ART capacity/refill, blue weight, staff
count, etc.). Star thresholds are `star2Flow` / `star3Flow` plus objective completion.

## Notes

- `game.js` is the original single-file prototype, **kept for reference only** — it is
  no longer loaded by `index.html`. The 2.0 build lives entirely under `js/`.
- No local image tooling (Python/Node/ImageMagick) was used or required; all raster
  content is either embedded, downloaded (icons), or generated procedurally at boot.
