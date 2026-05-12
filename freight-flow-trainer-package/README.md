# Freight Flow Trainer

Polished 2D warehouse freight-flow training prototype. Open `index.html` in Chrome to play; no build step is required.

## How To Play

- Keep Primary and Secondary freight flowing into bases.
- Click a full pallet, then click shared staging for brown/red/orange/purple pallets.
- Click a full blue pallet, then click the IBT trailer.
- Replenish bases by clicking the Empty Pallet Trailer, choosing two empty stack slots to split `14` into `7 + 7`, then selecting a stack and clicking a matching-side base.
- Toggle a side to RAA when its ART trailer is empty, then click the RAA door to stage 3-box pallets until the ART refill arrives.
- Call GPM manually only when needed. It clears staging but costs points.

## Training Mechanics Included

- Primary ART starts at 100 boxes and spawns every 900ms.
- Secondary ART starts at 100 boxes and spawns every 2200ms.
- ART refill requests take 45 seconds.
- RAA doors stage 3-box pallets and do not auto-refill.
- Ten bases total, 5 per side, with 6-box pallet capacity.
- Freight colors follow the requested mix and lock bases immediately when assigned.
- Shared staging is a 4-column by 3-row grid with 3 pallets per slot and completed-row gravity after random GPM clears.
- Blue pallets route only to IBT, with 10-pallet capacity and 15-second trailer clearing.
- Blocked bases apply a 1-second grace period, then -50 per second while blocked.
- Flow conveyors show green, flashing yellow, or flashing red based on source, blocked bases, and missing pallets.

## Controls

All controls are mouse/touch:

- Full pallet: select pallet.
- Staging lane: stage selected non-blue pallet.
- IBT trailer: stage selected blue pallet.
- Empty Pallet Trailer: start a 14-stack split.
- Empty pallet stack: select for replenishment.
- Matching-side base: place an empty pallet.
- RAA door: stage an RAA pallet when that side is toggled to RAA.
- HUD buttons: GPM, IBT, trailer requests, and ART/RAA toggles.

## Assets

No external art assets are used. All warehouse floor visuals, worker icons, pallet jacks, conveyors, freight boxes, warning states, and HUD elements are drawn procedurally in `game.js`, so there are no third-party license requirements.

## Tuning Notes

Most gameplay values live near the top of `game.js` in `CONFIG`, including spawn intervals, refill timers, capacities, scoring, freight mix, and staging behavior. Layout coordinates are centralized in `LAYOUT` and generated entity bounds, making it easier to expand the map later.
