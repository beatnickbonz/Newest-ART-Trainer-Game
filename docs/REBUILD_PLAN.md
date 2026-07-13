# Warehouse Flow Commander — Rebuild Plan

**For:** Claude Code (agentic execution)
**Goal:** Rebuild the prototype into a visually polished, well-structured game **without changing the training simulation's behavior**. Primary win condition is *visual polish / art direction*; secondary is a *light sim refactor* so the core loop can evolve later. Target: **desktop + tablet**.

---

## 0. The one rule that governs everything

The simulation in `js/sim.js` is the product. Everything the player is being trained on — the carton→base→pallet→staging→GPM/IBT pipeline, flow-health pressure, trailer economics, ART/RAA sourcing, scoring, star grading — lives there and in the tuning/scenario data in `js/config.js`. **It is already cleanly decoupled: `sim.js` is Phaser-free, and `world.js`/`ui.js` only *read* sim state and *call* a fixed set of sim methods.** That seam is what makes this rebuild safe.

**Rule:** Treat the sim's public method/state surface (Appendix A) as a frozen contract. You may rebuild anything that sits *above* that seam (renderer, UI, textures, sprites, scene chrome, layout geometry). You may *not* change gameplay numbers, pressure formulas, scoring, or objective logic as part of the "polish" work. If a mechanic genuinely needs to change, that is a separate, explicitly-flagged task — never a side effect of a visual change.

**Regression guard:** Before touching anything, capture current behavior as a baseline (Phase 0). After each phase, the sim must still produce identical results for identical inputs.

---

## 1. What is "keep" vs. "replace"

| Layer | File(s) | Disposition |
| --- | --- | --- |
| **Simulation core** | `js/sim.js` | **KEEP** behavior. Light *internal* refactor allowed (Phase 5) but outputs must be identical. |
| **Tuning + scenarios + freight + glossary** | `js/config.js` (the `TUNE`, `FREIGHT`, `SCENARIOS`, `GLOSSARY`, `SCORES` halves) | **KEEP** values. |
| **Layout geometry** | `js/config.js` (the `LAYOUT`, `ZONES`, `basePos`/`lanePos`/`lineHeadPos`/etc. helpers) | **REPLACE** freely — this is presentation. |
| **World renderer** | `js/world.js` | **REPLACE** — art direction, 2.5D, lighting, sprites, animation. |
| **UI / HUD** | `js/ui.js` | **REPLACE** — panels, gauges, command bar, tooltips, toasts. |
| **Textures** | `js/textures.js` | **REPLACE** — new procedural/art pipeline. |
| **Styling / boot** | `style.css`, `index.html` boot screen | **REPLACE** — restyle. |
| **Sprites** | `worker_sprites_v2.png`, `rc_operator_sprites.png` + `*Data.js` | **REPLACE-able** — see Phase 3. |
| **Scenes / flow** | `js/scenes.js` | **RESTYLE** — keep scene graph + sim wiring, replace visuals. |
| **Save / audio / tutorial / main** | `js/save.js`, `js/audio.js`, `js/tutorial.js`, `js/main.js` | **KEEP** structurally; audio can be enriched, tutorial re-skinned. |

---

## 2. Phased execution plan

Each phase is independently shippable and leaves the game runnable. Do them in order.

### Phase 0 — Baseline, guardrails, and workspace (do first, do not skip)

1. Get it running locally (`serve.ps1`, or any static server) and confirm the current build works end-to-end: menu → scenario → shift → results.
2. **Freeze the contract.** Extract the sim's public surface into a written interface doc (`docs/SIM_CONTRACT.md`) — copy Appendix A of this plan and verify every method/field against the live code. This is the acceptance spec for every later phase.
3. **Add a determinism seam + regression harness.** The sim currently calls `Math.random()` directly (see `pickFreight`, `generateOffer`, GPM chance). To test that behavior is unchanged across a refactor:
   - Introduce a single injectable RNG (a seeded PRNG, e.g. mulberry32) threaded through the sim. Default seed = existing behavior when unseeded, so production is unaffected.
   - Write a headless harness (Node, no Phaser) that constructs `new Sim(scenario)`, feeds a fixed sequence of `update(delta)` calls plus a scripted list of player actions, and snapshots `sim.evaluate()` + key state hashes.
   - Commit golden snapshots for all 6 scenarios. **These snapshots must not change in Phases 1–4, and must be regenerated intentionally (with review) only in Phase 5.**
4. **Split the config.** Physically separate `config.js` into `config.gameplay.js` (TUNE/FREIGHT/SCORES/SCENARIOS/GLOSSARY — frozen) and `config.layout.js` (LAYOUT/ZONES/pos-helpers — free to rewrite). This makes the keep/replace boundary visible in the file tree and prevents accidental gameplay edits during visual work. Update `index.html` load order.
5. Set up an **asset/style token module** (`js/theme.js`): a single source of truth for palette, type scale, spacing, radii, shadow/elevation, motion timings. Everything visual reads from here. (Consult the `frontend-design` skill for token structure and avoiding templated defaults.)

**Acceptance:** game runs identically; harness green on all 6 scenarios; config physically split; theme module exists.

---

### Phase 1 — Art direction & visual language (decide before building)

This is the heart of your primary goal. Produce a short **art direction spec** (`docs/ART_DIRECTION.md`) *before* mass-editing renderer code, so the polish is intentional rather than incidental. Use the `frontend-design` skill.

Decide and document:
- **Camera & projection:** keep the current soft 2.5D (dimetric-ish), or commit to a cleaner isometric grid. Define the tile/depth math once so `world.js` and layout helpers agree.
- **Palette & materials:** evolve the existing amber/cyan-on-steel identity (it's good) into a fuller material system — concrete, painted floor lines, steel racking, wrapped pallets, freight-color language. Keep freight colors *legible and distinct* since color = the core teaching signal.
- **Lighting model:** dock-door daylight spill, overhead pools, flow-health mood grade (currently a red pulse when critical — make it a graded, readable environmental cue).
- **Motion language:** haul arcs, pallet drops, lane-complete celebration, alert pulses. Define easing/duration tokens.
- **Readability rules (non-negotiable):** even though polish is the goal, the sim's *teaching state must stay instantly legible* — base fill level, which base is full/blocked, which lane is mixed vs. clean vs. ready, IBT/RAA levels, trailer blue%. Every visual choice is checked against "can a trainee read the decision at a glance?"

**Deliverable:** a 1-2 page spec + a single "hero frame" mockup (can be a static HTML/SVG comp via the frontend tooling) approved before Phase 2 mass work.

---

### Phase 2 — Rebuild the world renderer (`world.js` + `textures.js`)

Rebuild against the frozen sim state. The renderer reads these each frame (all already used today): `sim.state.sides[k].{line, bases, artBacklog, source, raaPrep, trailerOffer, ...}`, `sim.state.staging.lanes`, `sim.state.ibt`, `sim.state.emptyStacks`, `sim.state.rc`, `sim.workers.workers`, `sim.state.flowHealth`.

1. **New layout geometry** in `config.layout.js`: reposition docks/staging/RAA/IBT/empties for the chosen projection and for a 16:9 that also reflows acceptably to tablet aspect ratios. Keep the *logical* zones identical (primary/secondary docks, shared staging, IBT, RAA prep ×2, empty stacks ×2, empty trailer) — only their pixel positions change.
2. **Environment pass:** floor, painted lanes, back wall + animated dock doors/shutters, racking, conveyors, zone framing, lighting, vignette. Port the good bits of `textures.js` (soft shadows, light pools, 2.5D box faces) into the new material system; upgrade fidelity.
3. **Dynamic pass:** bases with clear fill indication, wrapped full pallets (glowing when haulable), staging lanes with unmistakable clean/mixed/ready states, IBT/RAA/empty meters, RC forklift, workers.
4. **FX pass:** haul pickup/drop, lane-complete burst, GPM sweep, score pops routed from `sim.scoring.drain()`, flow-mood grade.
5. **Input:** base click → `scene.onBaseClick(base)` → `sim.rc.requestHaulAt(base)`; zone clicks → existing `onZoneClick` routing. Keep these call sites identical; only their hitboxes move with the new layout.

**Acceptance:** harness still green (renderer can't affect it); all teaching states visibly distinct; runs at 60fps on a mid laptop and a tablet.

---

### Phase 3 — Sprites & characters

Sprites are replaceable. Two supported paths — pick per the art direction:

- **Path A (keep & polish):** reuse the provided sheets. `worker_sprites_v2.png` is a 7-frame × 4-character sheet (idle/turn/back/walk/carry/etc. at 96×128); `rc_operator_sprites.png` is the forklift operator (empty→loaded, both facings, 144×112). Re-slice/clean, add shadow blobs, tighten the walk/carry animation cadence in the renderer's `workerFrame`/`rcFrame` logic. Lowest risk.
- **Path B (replace):** commission/generate a new consistent sprite set matching the new art direction. **Constraint:** keep the *frame semantics* the renderer expects (idle, directional walk, carry, RC empty/loaded, facing flip) so `world.js` animation code stays simple. Update `WORKER_SHEET`/`RC_SHEET` frame dims + the embedded data-URI modules.

Keep sprites **embedded as data URIs** (as today) for reliable local/file:// loading — don't regress to external image files.

**Acceptance:** characters animate cleanly through shuttle/haul/idle; no frame tearing; visual style matches the spec.

---

### Phase 4 — UI / HUD rebuild (`ui.js` + `style.css` + scene chrome)

Rebuild the HUD, side panels, and command bar against the frozen action API (Appendix A). This is where desktop+tablet ergonomics land.

1. **HUD:** score, flow-health gauge (make it the emotional centerpiece — it's the master teaching signal), shift timer, live objective chips. Same data, better information design.
2. **Dock panels (primary left / secondary right):** ART/RAA meter + source toggle, RAA prep, **trailer manifest card** with a prominent blue% read + Accept/Reject, crew count + reassign, line/full/need readout. Keep every `onClick` wired to the exact same sim method it calls today.
3. **Command bar:** Clear IBT, Rework, Call GPM, Restock, Ship Partial — same actions, same keybinds (Appendix B). Tooltips + labeled buttons stay (they're good pedagogy).
4. **Tablet adaptation:** the current design assumes 1280×720 fixed panels and keyboard shortcuts. For tablet: ensure touch targets ≥44px, make the two dock panels and command bar reflow/collapse gracefully at narrower aspect ratios, and make every keyboard action reachable by tap (it mostly already is — every key has a button). Do **not** try to support phones this round (out of scope per target).
5. **Toasts/alerts:** render from `sim.alerts.items`; keep severity→style mapping.

**Acceptance:** every action still routes to the identical sim call; no gameplay drift; usable via touch on tablet; harness green.

---

### Phase 5 — Light sim refactor for future loop changes (explicit, snapshot-regenerating)

Only now, and as its own reviewable step, make the sim easier to evolve — **without changing current behavior** (golden snapshots must still match; if a change is purely structural they will).

Recommended, low-risk, high-leverage:
1. **Emit events, don't just mutate.** Add a tiny event emitter to the sim (`sim.on('haul'|'laneClean'|'trailerOffer'|'flowCritical'|...)`). Renderer/UI/audio subscribe instead of polling for one-shot moments. This decouples presentation further and makes future loop changes non-breaking for the view layer. (This is the "add an event bus" idea, scoped tightly.)
2. **Name the pressure model.** Extract the flow-health weights from `updateFlowHealth`'s inline formula into a named config block (`FLOW_WEIGHTS`) so future tuning of the core loop is data, not code. Behavior identical; values unchanged.
3. **Formalize player actions.** Wrap the scattered `sim.rc.*` / `sim.flow.*` / `sim.staging.*` / `sim.workers.reassign` calls behind a single `sim.dispatch(action, payload)` facade that returns success/failure + reason. UI calls the facade; keeps a clean list of "everything the RC can do" for when you add new decisions later.
4. **Document extension points.** In `docs/SIM_CONTRACT.md`, mark where a *new* core-loop mechanic would plug in (new zone type, new freight route, new source, new objective kind) so future-you (or a future Claude Code session) has a map.

**Acceptance:** golden snapshots regenerated *intentionally* and reviewed to confirm only expected/no behavioral change; event bus + action facade in place; flow weights externalized.

---

### Phase 6 — Polish, audio, performance, ship

1. **Motion & juice:** finalize easing, screen-space celebration on clean lanes / 3-star, subtle idle life on the floor.
2. **Audio:** the WebAudio synth is solid; add a couple of layered cues for the new key moments now that events exist (trailer dock, IBT truck-out, flow-critical bed shift).
3. **Boot/menus/results/glossary/credits:** restyle to the new art direction; keep flow and save logic.
4. **Performance pass:** batch graphics, cap FX, verify 60fps desktop + tablet; verify `file://` open still works (embedded assets).
5. **Accessibility of the teaching signal:** colorblind-safe freight palette or secondary encoding (icon/pattern) on freight/lanes, since color carries meaning.

---

## 3. Working agreements for Claude Code

- **Never edit `config.gameplay.js` values or `sim.js` behavior to make a visual thing work.** If tempted, stop and surface it as a proposed mechanic change.
- **Run the headless harness after every phase.** Green = safe. In Phases 1–4 a red harness means you changed gameplay by accident — revert.
- **Keep it dependency-light and bundler-free** (global scripts loaded in order, as today) unless a build step is explicitly agreed. Preserve `file://`-openable, embedded-asset behavior.
- **One phase per PR/commit-group**, each leaving a runnable game.
- **Consult the `frontend-design` skill** for the art direction, tokens, and any HTML/CSS chrome.

---

## Appendix A — Frozen sim contract (verify against live code in Phase 0)

**Construction & loop**
- `new Sim(scenario)` → `.state`, `.tune`, `.scenario`, `.alerts`, `.scoring`, `.workers`, `.flow`, `.staging`, `.rc`
- `sim.update(delta)` — advances one frame
- `sim.evaluate()` → `{ stars, avgFlow, score, objectives, allObjectives, stats, timeline }`
- `sim.avgFlow()`, `sim.avgUtil()`

**Player actions (the full RC decision set — UI must route to these unchanged)**
- Haul: `sim.rc.requestHaulAt(base)` (handles full pallet, blue→IBT, and partial when `state.partialArmed`)
- Partial arm toggle: set `sim.state.partialArmed`
- RAA prep: `sim.rc.requestRaaPrep('primary'|'secondary')`
- Restock empties: `sim.rc.requestRestock()`
- Source toggle: `sim.flow.toggleSource('primary'|'secondary')`
- Trailer: `sim.flow.acceptOffer(side)` / `sim.flow.rejectOffer(side)` (side = `sim.state.sides[key]`)
- IBT clear: `sim.staging.requestIbt()`
- Rework mixed lane: `sim.staging.reworkMixedLane()`
- Manual GPM: `sim.staging.manualGpm()`
- Crew reassign: `sim.workers.reassign('primary'|'secondary')`

**Read-only state the view renders**
- `sim.state.sides[k]`: `line[]`, `bases[]` (`boxes, incoming, empty, blocked, fullPallet, colorKey, color, pop`), `artBacklog`, `source`, `raaPrep`, `raaBoxes`, `raaStackingLocked`, `raaStarved`, `refillTimer`, `trailerOffer` (`bluePct, mix, bad`), `offerCooldown`
- `sim.state.staging.lanes[]`: `pallets[], colorKey, color, mixed, ready, reserved, pop`
- `sim.state.ibt`: `count, clearing, timer`
- `sim.state.emptyStacks.{primary,secondary}`: `count, capacity`
- `sim.state.rc`: `x, y, tx, ty, carry, facing, moving, job, queue, status`
- `sim.workers.workers[]`: `x, y, tx, ty, side, carry, facing, moving, status`; plus `sim.workers.utilization()`, `countOnSide(k)`
- `sim.state.flowHealth`, `flowTimeline`, `sim.state.stats.*`, `sim.state.score`, `sim.state.shiftRemaining`
- `sim.scoring.drain()` → score-pop list; `sim.alerts.items` → toasts

**Geometry helpers the renderer calls (these move to `config.layout.js` and may be rewritten):** `basePos`, `lanePos`, `lineHeadPos`, `lineSlotPos`, `restPos`, `stackPos`, `rcHome`, `zoneOf`, `zoneHome`, `center`.

---

## Appendix B — Keybindings to preserve

Source toggle P/S = `Q`/`W` · Prep RAA P/S = `Z`/`X` · Accept/Reject Primary = `1`/`2` · Accept/Reject Secondary = `3`/`4` · Clear IBT = `E` · Rework = `R` · Restock = `C` · Ship Partial = `V` · Call GPM = `G` · Glossary = `T` · Pause = `Space` · Mute = `M` · Haul = click pallet.

---

## Appendix C — Open questions for the human (safe defaults assumed)

1. **Projection commitment:** keep soft 2.5D or move to strict isometric? *(Default: keep 2.5D, upgrade fidelity — lower risk.)*
2. **Sprites Path A (polish existing) vs Path B (new set)?** *(Default: Path A first; revisit if art direction demands B.)*
3. **Tablet reflow depth:** graceful panel reflow only, or a genuinely touch-first redesign of the panels? *(Default: reflow + ≥44px touch targets; keep desktop layout as the base.)*
4. **Any freight-color changes off-limits** for brand reasons? *(Default: keep current freight hues, only add secondary encoding for accessibility.)*
