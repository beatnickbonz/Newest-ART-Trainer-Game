# Sim Contract — FROZEN

This is the acceptance spec for the rebuild. Everything below was verified against the
live code (`js/sim.js`, `js/config.js`, `js/ui.js`, `js/scenes.js`) on 2026-07-03.
**No phase of the rebuild may change the behavior behind this surface.** The regression
harness (`tests/harness.html` + `tests/golden/`) enforces it.

---

## Construction & loop

- `new Sim(scenario)` → exposes `.state`, `.tune`, `.scenario`, `.alerts`, `.scoring`,
  `.workers`, `.flow`, `.staging`, `.rc`
- `sim.update(delta)` — advances one frame (ms delta). No-ops when `state.gameOver` or `state.paused`.
- `sim.evaluate()` → `{ stars, avgFlow, score, objectives, allObjectives, stats, timeline }`
- `sim.avgFlow()`, `sim.avgUtil()`

## Player actions (the full RC decision set — UI must route to these unchanged)

| Action | Call |
| --- | --- |
| Haul (full pallet / blue→IBT / armed partial) | `sim.rc.requestHaulAt(base)` |
| Arm partial | set `sim.state.partialArmed` (auto-clears after queueing a haul) |
| RAA prep | `sim.rc.requestRaaPrep('primary'\|'secondary')` |
| Restock empties | `sim.rc.requestRestock()` |
| Source toggle | `sim.flow.toggleSource('primary'\|'secondary')` |
| Trailer accept / reject | `sim.flow.acceptOffer(side)` / `sim.flow.rejectOffer(side)` — `side` is the object `sim.state.sides[key]`, not the key |
| IBT clear | `sim.staging.requestIbt()` |
| Rework mixed lane | `sim.staging.reworkMixedLane()` |
| Manual GPM | `sim.staging.manualGpm()` |
| Crew reassign | `sim.workers.reassign('primary'\|'secondary')` (arg = destination side) |

Read-only helpers the UI uses for button enablement: `sim.rc.queueRoom()`,
`sim.workers.countOnSide(k)`, `sim.workers.utilization()`.

### `sim.dispatch(action, payload)` facade (Phase 5)

The UI/scenes route every player action through this facade; the underlying
methods above remain the frozen API (the harness bot still calls them directly).
Denial reasons surface via `sim.alerts` as before.

| action | payload | wraps |
| --- | --- | --- |
| `haul` | `{base}` | `rc.requestHaulAt` |
| `togglePartial` | — (returns new armed state) | `state.partialArmed` flip |
| `raaPrep` | `{side}` | `rc.requestRaaPrep` |
| `restock` | — | `rc.requestRestock` |
| `toggleSource` | `{side}` | `flow.toggleSource` |
| `acceptTrailer` / `rejectTrailer` | `{side}` (key, not object) | `flow.acceptOffer/rejectOffer` |
| `clearIbt` | — | `staging.requestIbt` |
| `rework` | — | `staging.reworkMixedLane` |
| `manualGpm` | — | `staging.manualGpm` |
| `reassign` | `{to}` | `workers.reassign` |

### Events (Phase 5 — `sim.on(event, fn)`, emit-only, behavior-neutral)

`palletFull{side,index,colorKey}` · `haul{dest,lane,partial}` · `laneClean{lane,hot,colorKey}` ·
`laneMixed{lane}` · `gpmPick{lane,cleared}` · `manualGpm{cleared}` · `rework{groups}` ·
`ibtStart{count}` · `ibtCleared{cleared}` · `trailerOffer{side,bluePct,bad}` ·
`trailerAccept{side}` · `trailerReject{side}` · `trailerDocked{side}` · `sourceToggle{side,source}` ·
`raaPrep{side}` · `raaDry{side}` · `restock{}` · `flowCritical{on}` (edge-triggered) · `shiftEnd{}`

Flow-health pressure weights now live in `TUNE.flowWeights` (config.gameplay.js,
`FLOW_WEIGHTS` values identical to the old inline formula — verified by the
goldens passing unregenerated after the Phase 5 refactor).

## Read-only state the view renders

- `sim.state.sides[k]`: `line[]` (freight boxes: `key, color, css, claimed`), `bases[]`
  (`index, sideKey, colorKey, color, boxes, incoming, empty, blocked, fullPallet, pop`),
  `artBacklog`, `source` (`"ART"|"RAA"`), `raaPrep`, `raaBoxes`, `raaStackingLocked`,
  `raaStarved`, `refillTimer`, `trailerOffer` (`{bluePct, mix, bad, id}` or null), `offerCooldown`
- `sim.state.staging.lanes[]`: `index, label, pallets[], colorKey, color, mixed, ready, reserved, pop`
- `sim.state.staging.gpmFlash`, `gpmClock`
- `sim.state.ibt`: `count, clearing, timer`
- `sim.state.emptyStacks.{primary,secondary}`: `count, capacity`
- `sim.state.rc`: `x, y, tx, ty, carry, facing, moving, job, queue, status, dwell`
- `sim.workers.workers[]`: `id, x, y, tx, ty, side, slot, carry, facing, moving, status`
- `sim.state.flowHealth`, `flowSamples`, `flowTimeline`, `stats.*`, `score`,
  `shiftRemaining`, `shiftTotal`, `partialArmed`, `paused`, `gameOver`
- `sim.scoring.drain()` → one-shot score-pop list `{amount, reason, x, y, age}`
- `sim.alerts.items` → toasts `{text, severity, age, life}` (severity: info|good|warn|bad)

## Amendments discovered in Phase 0 (differences from the original plan)

1. **Sim-space geometry is FROZEN, not free.** The sim moves workers and the RC through
   pixel coordinates from `basePos/lanePos/lineHeadPos/lineSlotPos/restPos/stackPos/rcHome/zoneOf/center`
   at fixed px/sec speeds (`workerSpeed`, `rcWorkerSpeed`). Travel distance ⇒ time ⇒
   throughput ⇒ score. Therefore the ZONES rectangles and position helpers are part of the
   gameplay contract and live in `config.gameplay.js`. **The renderer must project sim-space
   → screen-space** (any projection it likes) instead of moving the logical positions.
   Decision approved 2026-07-03.
2. **The sim is Phaser-free but not dependency-free.** It calls the global `Sound.play(...)`
   (in `AlertManager`, `WorkerManager`, `FlowManager`, `StagingManager`, `RcController`) and
   assigns `window.Sim`. Headless contexts must stub `Sound` before loading `sim.js`.
3. **Sim randomness lives in two files.** `pickFreight()` and `rint()` are defined in the
   config (gameplay half) and called by the sim; the GPM chance roll and trailer-offer
   generation are in `sim.js`. All are routed through the seeded `SimRNG` seam (unseeded =
   `Math.random`, production behavior unchanged). Visual randomness in `world.js`/`textures.js`
   must NOT consume from `SimRNG`.
4. **`trailerOffer.id` is write-only** — nothing reads it. It was `Date.now() + Math.random()`;
   now a deterministic per-sim counter so snapshots are stable.
5. `basePos(sideKey, index)` — the original third `count` parameter was unused.
6. `center()` and `cap1()` are defined in `sim.js` itself, not the config.

## Keybindings (preserve)

Source toggle P/S = `Q`/`W` · Prep RAA P/S = `Z`/`X` · Accept/Reject Primary = `1`/`2` ·
Accept/Reject Secondary = `3`/`4` · Clear IBT = `E` · Rework = `R` · Restock = `C` ·
Ship Partial (arm) = `V` · Call GPM = `G` · Glossary = `T` · Pause = `Space` · Mute = `M` ·
Haul = click pallet. Keys are inert while paused except `M`.

## Behavior changelog (explicit, snapshot-regenerating changes only)

- **2026-07-04 — Per-box freight objects (user-approved bug fix).** `emit()` used
  to push the SHARED freight-table entry returned by `pickFreight()`, so every
  same-color carton was one object: a worker's claim ghosted the whole color and
  `dispatch()`'s claimed-check silently enforced "one worker per freight color at
  a time" across both docks. Boxes are now per-object copies (`{...pickFreight()}`).
  Claims are per-box (≤ workers-per-side transparent cartons), crews can gang up
  on a color, labor throughput increased. Goldens regenerated, ALL PASS.

## Geometry changelog (explicit, snapshot-regenerating changes only)

- **2026-07-03 — Layout v2.2 (user-directed).** A worker PICK CORRIDOR now runs
  between each belt and its station rank: stations moved out to belt±92
  (`basePos`), pick point (`lineHeadPos`) and idle spots (`restPos`) sit on the
  corridor centerline (belt±38, `PICK_DX`). **One sim.js edit:**
  `RcController.targetFor` pickup phase targets `rcBasePos()` (station outer
  side, belt±138) so the forklift approaches from outside the corridor instead
  of driving through the workers. Goldens regenerated, ALL PASS.

- **2026-07-03 — Layout v2.1 (user-directed).** Conveyors extended to full height
  (door → pick head at y=585, `lineHeadPos`); the 5 build stations form a single
  vertical rank beside each belt (`basePos`: primary at belt+56 (right), secondary
  at belt−56 (left), rows y=285+80i); idle workers rest in the aisle between dock
  strip and staging (`restPos` 440/820); empties stacks moved center-bottom
  (470/810, 604); RAA zones slimmed to 70 tall. Goldens regenerated, ALL PASS.

- **2026-07-03 — Layout v2 (user-directed).** Service bays (empty-pallet trailer,
  IBT) moved to the two center dock doors; RAA prep areas shrunk and tucked under
  each dock's second door (now the RAA-supply door, shown with a docked trailer);
  secondary dock's ART feeding door moved to the RIGHT door (x=980), mirroring
  primary (x=300); primary/secondary work areas + staging moved down; inbound
  conveyors run vertically from the ART doors (`LINE_X`). Travel distances changed
  ⇒ golden snapshots regenerated intentionally; all 6 scenarios re-verified
  deterministic (ALL PASS on the new baseline).

## Extension points (for future core-loop work — Phase 5 fills this in)

- New zone type: add to sim-space ZONES + a manager owning its state; renderer picks it up
  from projection.
- New freight route: `RcController.requestHaulAt` dest switch (`"ibt"|"lane"`) is the seam.
- New source kind: `FlowManager.sourceReady/hasSource/emit` switch on `side.source`.
- New objective kind: `Sim.evaluate()` objective `kind` switch.
