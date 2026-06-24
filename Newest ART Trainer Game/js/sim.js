/* =============================================================================
 * Simulation core — RC OPERATOR edition (Phaser-free).
 *
 * You are the RC operator. Dock workers physically shuttle boxes from each
 * dock's inbound line onto color-coded bases (building pallets) and fetch empty
 * pallets to unblock bases. You (the player) drive the forklift: haul full
 * pallets to staging / IBT, prep RAA, restock empties, accept/reject trailers,
 * reassign labor, and ship partials. The renderer/UI only read this state.
 * ===========================================================================*/

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

class GameState {
  constructor(tune, table) {
    this.tune = tune;
    this.table = table;
    this.score = 0;
    this.flowHealth = 100;
    this.flowSamples = [];
    this.flowTimeline = [];
    this.shiftRemaining = tune.shiftMs;
    this.shiftTotal = tune.shiftMs;
    this.gameOver = false;
    this.paused = false;
    this.partialArmed = false;
    this.utilSum = 0; this.utilCount = 0; this.sampleClock = 0;
    this.stats = {
      cleanPallets: 0, cleanLanes: 0, mixedMistakes: 0, blockedTicks: 0,
      smoothRaa: 0, missedRaa: 0, manualGpm: 0, ibtOverflow: 0, emptyRestocks: 0,
      reworks: 0, trailersAccepted: 0, trailersRejected: 0, partialShips: 0,
      ibtCleared: 0, gpmPicks: 0, hauls: 0,
    };
    this.emptyStacks = {
      primary: { count: tune.emptyStackCapacity, capacity: tune.emptyStackCapacity },
      secondary: { count: tune.emptyStackCapacity, capacity: tune.emptyStackCapacity },
    };
    this.ibt = { count: 0, clearing: false, timer: 0 };
    this.sides = {
      primary: this.makeSide("primary", "Primary", tune.primarySpawnMs),
      secondary: this.makeSide("secondary", "Secondary", tune.secondarySpawnMs),
    };
    this.staging = {
      lanes: Array.from({ length: tune.stagingLanes }, (_, i) => ({
        index: i, label: String.fromCharCode(65 + i),
        pallets: [], colorKey: null, color: null,
        mixed: false, ready: false, reserved: false, jamClock: 0, pop: 0,
      })),
      gpmClock: 0, gpmFlash: 0,
    };
    const h = rcHome();
    this.rc = { x: h.x, y: h.y, tx: h.x, ty: h.y, job: null, queue: [], carry: null, facing: 1, moving: false, dwell: 0, status: "Idle" };
  }

  makeSide(key, label, spawnMs) {
    const t = this.tune;
    return {
      key, label, source: "ART", spawnMs, spawnClock: 0,
      artBacklog: t.artCapacity, refillTimer: 0,
      raaBoxes: 0, raaPrep: 0, raaStarved: false, raaStackingLocked: false,
      line: [], blockedClock: 0,
      mix: this.table, incomingMix: null,
      trailerOffer: null, offerCooldown: 0,
      bases: Array.from({ length: t.baseCount }, (_, i) => ({
        index: i, sideKey: key, colorKey: null, color: null, boxes: 0, incoming: 0,
        empty: true, blocked: false, fullPallet: null, pop: 0,
      })),
    };
  }
}

class AlertManager {
  constructor() { this.items = []; }
  push(text, severity = "info") {
    this.items.unshift({ text, severity, age: 0, life: 9000 });
    this.items = this.items.slice(0, 6);
    if (severity === "warn") Sound.play("warn");
    else if (severity === "bad") Sound.play("critical");
  }
  update(delta) { this.items.forEach((i) => (i.age += delta)); this.items = this.items.filter((i) => i.age < i.life); }
}

class ScoringManager {
  constructor(state, alerts, tune) { this.state = state; this.alerts = alerts; this.tune = tune; this.pops = []; }
  add(amount, reason, x, y) {
    this.state.score += amount;
    this.pops.push({ amount, reason, x, y, age: 0 });
    if (Math.abs(amount) >= 70) this.alerts.push(`${amount > 0 ? "+" : ""}${amount} ${reason}`, amount > 0 ? "good" : "warn");
  }
  drain() { const p = this.pops; this.pops = []; return p; }
}

/* ---------------- Workers: physical line->base shuttle ---------------- */
class WorkerManager {
  constructor(state, alerts, tune) {
    this.state = state; this.alerts = alerts; this.tune = tune;
    this.workers = [];
    const n = tune.staff;
    const slot = { primary: 0, secondary: 0 };
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? "primary" : "secondary";
      const s = slot[side]++;
      const r = restPos(side, s);
      this.workers.push({
        id: i + 1, side, slot: s, x: r.x, y: r.y, tx: r.x, ty: r.y,
        job: null, carry: null, facing: 1, moving: false, status: "Idle", efficiency: 0.85,
      });
    }
  }

  countOnSide(side) { return this.workers.filter((w) => w.side === side).length; }
  busy() { return this.workers.filter((w) => w.job).length; }
  utilization() { return this.workers.length ? this.busy() / this.workers.length : 0; }
  atTarget(w) { return dist(w.x, w.y, w.tx, w.ty) < 8; }

  reassign(toSide) {
    const from = toSide === "primary" ? "secondary" : "primary";
    if (this.countOnSide(from) <= 1) { this.alerts.push(`Can't pull the last worker off ${from}.`, "warn"); Sound.play("deny"); return false; }
    const pool = this.workers.filter((w) => w.side === from);
    const w = pool.find((x) => !x.job) || pool[0];
    this.abortJob(w);
    w.side = toSide; w.slot = this.countOnSide(toSide);
    const r = restPos(toSide, w.slot); w.tx = r.x; w.ty = r.y;
    Sound.play("assign");
    this.alerts.push(`Worker moved to ${toSide === "primary" ? "Primary" : "Secondary"} dock.`, "good");
    return true;
  }

  abortJob(w) {
    const j = w.job; if (!j) return;
    if (j.type === "shuttle") {
      if (j.base) j.base.incoming = Math.max(0, j.base.incoming - 1);
      if (w.carry) { this.state.sides[w.side].line.push(w.carry); w.carry = null; }
      else if (j.box) j.box.claimed = false;
    } else if (j.type === "empty" && j.phase === "toBase") {
      const st = this.state.emptyStacks[w.side];
      st.count = Math.min(st.capacity, st.count + 1);
    }
    w.job = null; w.carry = null;
  }

  /* Rebuild reservations from live jobs each frame so a lost job can never
     leave a box "claimed" forever or a base reserved-but-empty. */
  reserve() {
    const taken = new Set();
    Object.values(this.state.sides).forEach((sd) => sd.bases.forEach((b) => { b.incoming = 0; }));
    this.workers.forEach((w) => {
      if (w.job && w.job.type === "shuttle") {
        if (w.job.box) taken.add(w.job.box);
        if (w.job.base) w.job.base.incoming += 1;
      }
    });
    this._taken = taken;
    // mark line boxes for the renderer + clear abandoned base color reservations
    Object.values(this.state.sides).forEach((sd) => {
      sd.line.forEach((box) => { box.claimed = taken.has(box); });
      sd.bases.forEach((b) => { if (b.boxes === 0 && b.incoming === 0 && !b.blocked && !b.fullPallet && b.colorKey != null) { b.colorKey = null; b.color = null; } });
    });
  }

  dispatch(w) {
    const side = this.state.sides[w.side];
    const cap = this.tune.baseCapacity;
    // priority 1: unblock a base that needs an empty pallet
    const need = side.bases.find((b) => !b.empty && b.blocked && !b.fullPallet && !this.baseHasWorker(b));
    if (need && this.state.emptyStacks[w.side].count > 0) {
      w.job = { type: "empty", phase: "toStack", base: need };
      const p = stackPos(w.side); w.tx = p.x; w.ty = p.y; return;
    }
    // priority 2: shuttle a placeable box from the line
    for (const box of side.line) {
      if (this._taken.has(box)) continue;
      const base = this.findBaseFor(side, box, cap);
      if (base) {
        this._taken.add(box); box.claimed = true; base.incoming += 1;
        if (base.colorKey == null) { base.colorKey = box.key; base.color = box.color; }
        w.job = { type: "shuttle", phase: "toLine", box, base };
        const p = lineHeadPos(w.side); w.tx = p.x; w.ty = p.y; return;
      }
    }
    // idle -> drift to rest spot
    const r = restPos(w.side, w.slot); w.tx = r.x; w.ty = r.y;
  }

  findBaseFor(side, box, cap) {
    const same = side.bases.find((b) => b.empty && !b.blocked && b.colorKey === box.key && (b.boxes + b.incoming) < cap);
    if (same) return same;
    return side.bases.find((b) => b.empty && !b.blocked && b.colorKey == null && b.boxes === 0 && b.incoming === 0);
  }
  baseHasWorker(base) { return this.workers.some((w) => w.job && w.job.base === base); }

  update(delta) {
    const dt = delta / 1000;
    this.reserve();
    this.workers.forEach((w) => {
      if (!w.job) this.dispatch(w);
      const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
      if (d > 2) {
        const step = Math.min(d, this.tune.workerSpeed * dt);
        w.x += (dx / d) * step; w.y += (dy / d) * step; w.moving = true;
        if (Math.abs(dx) > 1) w.facing = dx < 0 ? -1 : 1;
      } else { w.moving = false; if (w.job) this.onArrive(w); }
      w.status = this.statusText(w);
    });
  }

  onArrive(w) {
    const j = w.job, cap = this.tune.baseCapacity;
    if (j.type === "empty") {
      if (j.phase === "toStack") {
        const st = this.state.emptyStacks[w.side];
        if (st.count > 0) { st.count -= 1; j.phase = "toBase"; const p = basePos(w.side, j.base.index); w.tx = p.x; w.ty = p.y; }
        else { w.job = null; }
        return;
      }
      const b = j.base; b.empty = true; b.blocked = false; b.boxes = 0; b.colorKey = null; b.color = null; b.incoming = 0; b.pop = 1;
      this.scoring.add(this.tune.scores.emptyPallet, "empty set");
      w.job = null; return;
    }
    // shuttle
    if (j.phase === "toLine") {
      const idx = this.state.sides[w.side].line.indexOf(j.box);
      if (idx >= 0) this.state.sides[w.side].line.splice(idx, 1);
      w.carry = j.box; j.phase = "toBase";
      const p = basePos(w.side, j.base.index); w.tx = p.x; w.ty = p.y; return;
    }
    const b = j.base;
    b.incoming = Math.max(0, b.incoming - 1);
    b.boxes += 1; b.colorKey = j.box.key; b.color = j.box.color; b.pop = 1;
    if (b.boxes >= cap) { b.fullPallet = { colorKey: b.colorKey, color: b.color, side: w.side }; b.blocked = true; Sound.play("beep"); }
    w.carry = null; w.job = null;
  }

  statusText(w) {
    if (!w.job) return w.moving ? "Repositioning" : "Idle";
    if (w.job.type === "empty") return "Fetching empty pallet";
    return w.carry ? "Carrying to base" : "To inbound line";
  }
}

/* ---------------- Flow: source -> inbound line + trailer offers ---------------- */
class FlowManager {
  constructor(state, workers, scoring, alerts, tune) {
    this.state = state; this.workers = workers; this.scoring = scoring; this.alerts = alerts; this.tune = tune;
  }

  update(delta) {
    this.updateSide(this.state.sides.primary, delta);
    this.updateSide(this.state.sides.secondary, delta);
    this.updateFlowHealth(delta);
  }

  updateSide(side, delta) {
    side.spawnClock += delta;
    if (side.offerCooldown > 0) side.offerCooldown = Math.max(0, side.offerCooldown - delta);
    if (side.refillTimer > 0) {
      side.refillTimer = Math.max(0, side.refillTimer - delta);
      if (side.refillTimer === 0) {
        side.artBacklog = this.tune.artCapacity;
        side.mix = side.incomingMix || this.state.table; side.incomingMix = null;
        side.raaStarved = false; side.raaStackingLocked = false;
        Sound.play("trailer");
        this.alerts.push(`${side.label} ART trailer docked (${blueShareOf(side.mix)}% blue).`, "good");
      }
    }
    while (side.spawnClock >= side.spawnMs && side.line.length < this.tune.lineCap && this.sourceReady(side)) {
      side.spawnClock -= side.spawnMs;
      this.emit(side);
    }
    if (!this.hasSource(side) || side.line.length >= this.tune.lineCap) side.spawnClock = Math.min(side.spawnClock, side.spawnMs);

    if (side.artBacklog <= this.tune.offerLeadBacklog && side.refillTimer <= 0 && !side.trailerOffer && side.offerCooldown <= 0) {
      this.generateOffer(side);
    }

    const jam = side.line.length >= this.tune.lineCap - 1 || side.bases.some((b) => b.blocked);
    if (jam) {
      side.blockedClock += delta;
      if (side.blockedClock > 3500) { side.blockedClock = 0; this.state.stats.blockedTicks += 1; this.scoring.add(this.tune.scores.blockedTick, `${side.label} jam`); }
    } else side.blockedClock = Math.max(0, side.blockedClock - delta);
  }

  sourceReady(side) {
    if (side.source === "ART") {
      if (side.artBacklog > 0 && side.refillTimer <= 0) return true;
      if (!side.raaStackingLocked && side.raaPrep <= 0 && side.raaBoxes <= 0) side.raaStackingLocked = true;
      return false;
    }
    if (side.raaBoxes > 0) return true;
    if (side.raaPrep > 0) { side.raaPrep -= 1; side.raaBoxes = this.tune.raaPalletBoxes; side.raaStarved = false; return true; }
    if (!side.raaStarved) {
      side.raaStarved = true; this.state.stats.missedRaa += 1;
      this.scoring.add(this.tune.scores.starvation, `${side.label} RAA dry`);
      this.alerts.push(`${side.label} RAA is dry — prep backup freight.`, "bad");
    }
    return false;
  }
  hasSource(side) {
    if (side.source === "ART") return side.artBacklog > 0 && side.refillTimer <= 0;
    return side.raaBoxes > 0 || side.raaPrep > 0;
  }

  emit(side) {
    if (side.source === "ART") {
      side.artBacklog -= 1;
      if (side.artBacklog === 0 && side.raaPrep <= 0 && side.raaBoxes <= 0) side.raaStackingLocked = true;
    } else side.raaBoxes -= 1;
    side.line.push(pickFreight(side.mix));
  }

  generateOffer(side) {
    const cfg = this.tune.offerBlue;
    const bad = Math.random() < cfg.badChance;
    const blue = bad ? rint(cfg.badMin, cfg.badMax) : rint(cfg.min, cfg.max);
    side.trailerOffer = { bluePct: blue, mix: makeOfferMix(blue), bad, id: Date.now() + Math.random() };
    Sound.play("beep");
    this.alerts.push(`${side.label}: trailer waiting — ${blue}% blue. Accept or reject.`, blue >= cfg.badMin ? "warn" : "info");
  }

  acceptOffer(side) {
    if (!side.trailerOffer) { this.alerts.push(`${side.label} has no trailer to accept.`, "warn"); Sound.play("deny"); return; }
    side.refillTimer = this.tune.artRefillMs; side.incomingMix = side.trailerOffer.mix;
    this.state.stats.trailersAccepted += 1;
    this.scoring.add(this.tune.scores.trailerAccept, `${side.label} trailer accepted`);
    Sound.play("click");
    this.alerts.push(`${side.label} trailer accepted — docking.`, "good");
    side.trailerOffer = null;
  }
  rejectOffer(side) {
    if (!side.trailerOffer) { this.alerts.push(`${side.label} has no trailer to reject.`, "warn"); Sound.play("deny"); return; }
    side.offerCooldown = this.tune.offerCooldownMs;
    this.state.stats.trailersRejected += 1;
    this.scoring.add(this.tune.scores.trailerReject, `${side.label} trailer rejected`);
    Sound.play("deny");
    this.alerts.push(`${side.label} trailer rejected — next in ${Math.round(this.tune.offerCooldownMs / 1000)}s.`, "info");
    side.trailerOffer = null;
  }

  toggleSource(sideKey) {
    const side = this.state.sides[sideKey];
    side.source = side.source === "ART" ? "RAA" : "ART";
    if (side.source === "RAA" && side.raaPrep > 0 && side.raaBoxes <= 0) {
      side.raaPrep -= 1; side.raaBoxes = this.tune.raaPalletBoxes;
      if (side.artBacklog <= 0) { this.state.stats.smoothRaa += 1; this.scoring.add(this.tune.scores.smoothRaa, `${side.label} smooth RAA`); }
    }
    Sound.play("click");
    this.alerts.push(`${side.label} source → ${side.source}.`, "info");
  }

  updateFlowHealth(delta) {
    const p = this.state.sides.primary, s = this.state.sides.secondary;
    const lineBacklog = p.line.length + s.line.length;
    const full = this.fullCount(p) + this.fullCount(s);
    const blocked = [...p.bases, ...s.bases].filter((b) => b.blocked).length;
    const needEmpty = [...p.bases, ...s.bases].filter((b) => !b.empty && b.blocked && !b.fullPallet).length;
    const mixed = this.state.staging.lanes.filter((l) => l.mixed).length;
    const ibtP = this.state.ibt.count >= this.tune.ibtCapacity ? 18 : this.state.ibt.count >= 8 ? 8 : 0;
    const srcP = (p.source === "ART" && p.artBacklog <= 0 ? 12 : 0) + (s.source === "ART" && s.artBacklog <= 0 ? 12 : 0);
    const idleP = (1 - this.workers.utilization()) * 6;
    const pressure = lineBacklog * 1.35 + full * 2.4 + blocked * 5 + needEmpty * 4 + mixed * 7 + ibtP + srcP + idleP;
    const target = clamp(100 - pressure, 0, 100);
    this.state.flowHealth += (target - this.state.flowHealth) * Math.min(1, delta / 1200);
    this.state.flowSamples.push(this.state.flowHealth);
    if (this.state.flowSamples.length > 1200) this.state.flowSamples.shift();
  }
  fullCount(side) { return side.bases.filter((b) => b.fullPallet).length; }
}

/* ---------------- Staging: lanes, GPM, IBT, rework (no auto-transport) ------- */
class StagingManager {
  constructor(state, workers, scoring, alerts, tune) {
    this.state = state; this.workers = workers; this.scoring = scoring; this.alerts = alerts; this.tune = tune;
  }
  update(delta) {
    this.updateGpm(delta);
    this.updateIbt(delta);
    if (this.state.staging.gpmFlash > 0) this.state.staging.gpmFlash = Math.max(0, this.state.staging.gpmFlash - delta);
  }

  findLane(pallet) {
    const L = this.state.staging.lanes;
    return L.find((l) => !l.reserved && !l.mixed && !l.ready && l.colorKey === pallet.colorKey && l.pallets.length < this.tune.stagingCapacity)
      || L.find((l) => !l.reserved && l.pallets.length === 0 && !l.ready)
      || L.find((l) => !l.reserved && !l.ready && l.pallets.length > 0 && l.pallets.length < this.tune.stagingCapacity && !l.mixed);
  }
  hasOpenLane(pallet) { return !!this.findLane(pallet); }

  addToLane(lane, pallet) {
    if (lane.pallets.length === 0) { lane.colorKey = pallet.colorKey; lane.color = pallet.color; }
    if (lane.colorKey !== pallet.colorKey) {
      lane.mixed = true; lane.ready = false; lane.jamClock = 0;
      this.state.stats.mixedMistakes += 1;
      this.scoring.add(this.tune.scores.mixedLane, "mixed lane");
      this.alerts.push(`Lane ${lane.label} mixed — rework or GPM.`, "warn");
    }
    lane.pallets.push(pallet); lane.pop = 1;
    if (lane.pallets.length >= this.tune.stagingCapacity && !lane.mixed) {
      lane.ready = true;
      const hot = this.isHot(lane.colorKey);
      Sound.play("laneComplete");
      const lp = lanePos(lane.index, this.tune.stagingLanes);
      this.scoring.add(this.tune.scores.cleanStage + (hot ? this.tune.scores.hotStage : 0), hot ? "hot clean lane" : "clean lane", lp.x, lp.y - 60);
      this.state.stats.cleanPallets += lane.pallets.length;
      this.state.stats.cleanLanes += 1;
    }
  }

  isHot(colorKey) {
    if (!colorKey || colorKey === "Blue") return false;
    return Object.values(this.state.sides).some((side) => side.line.filter((b) => b.key === colorKey).length >= 2);
  }

  updateGpm(delta) {
    this.state.staging.gpmClock += delta;
    if (this.state.staging.gpmClock < this.tune.gpmMs) return;
    this.state.staging.gpmClock = 0;
    this.state.staging.lanes.forEach((lane) => {
      if (lane.ready && !lane.mixed && Math.random() < this.tune.gpmChance) {
        const cleared = lane.pallets.length; this.resetLane(lane);
        this.state.staging.gpmFlash = 600; this.state.stats.gpmPicks += 1;
        this.scoring.add(cleared * this.tune.scores.gpmClear, "GPM pickup");
      }
      if (lane.mixed) { lane.jamClock += this.tune.gpmMs; if (lane.jamClock >= 11000) { lane.jamClock = 0; this.scoring.add(-20, "mixed jam"); } }
    });
  }

  updateIbt(delta) {
    const ibt = this.state.ibt;
    if (!ibt.clearing) return;
    ibt.timer = Math.max(0, ibt.timer - delta);
    if (ibt.timer === 0) { this.state.stats.ibtCleared += ibt.count; this.alerts.push(`IBT cleared ${ibt.count} blue pallets.`, "good"); ibt.count = 0; ibt.clearing = false; }
  }
  requestIbt() {
    const ibt = this.state.ibt;
    if (ibt.clearing) { this.alerts.push("IBT clear already running.", "warn"); Sound.play("deny"); return; }
    if (ibt.count <= 0) { this.alerts.push("IBT has no blue pallets.", "warn"); Sound.play("deny"); return; }
    ibt.clearing = true; ibt.timer = this.tune.ibtClearMs; Sound.play("trailer");
    this.alerts.push("IBT clear requested.", "good");
  }

  manualGpm() {
    const staged = this.state.staging.lanes.reduce((s, l) => s + l.pallets.length, 0);
    if (staged === 0) { this.alerts.push("Nothing staged to GPM.", "info"); Sound.play("deny"); return; }
    this.state.staging.lanes.forEach((l) => this.resetLane(l));
    this.state.staging.gpmFlash = 600; this.state.stats.manualGpm += 1;
    this.scoring.add(this.tune.scores.manualGpm, "manual GPM");
    this.alerts.push(`Manual GPM cleared ${staged} staged pallets.`, "warn");
  }

  reworkMixedLane() {
    const lane = this.state.staging.lanes.find((l) => l.mixed);
    if (!lane) { this.alerts.push("No mixed lane to rework.", "info"); Sound.play("deny"); return; }
    const groups = [];
    lane.pallets.forEach((p) => { let g = groups.find((x) => x.colorKey === p.colorKey); if (!g) { g = { colorKey: p.colorKey, color: p.color, pallets: [] }; groups.push(g); } g.pallets.push(p); });
    const open = this.state.staging.lanes.filter((l) => l !== lane && !l.reserved && l.pallets.length === 0);
    if (open.length < groups.length - 1) { this.alerts.push("Rework needs more open lanes.", "warn"); Sound.play("deny"); return; }
    this.resetLane(lane);
    groups.forEach((g, i) => { const t = i === 0 ? lane : open[i - 1]; t.colorKey = g.colorKey; t.color = g.color; t.pallets = g.pallets; t.ready = t.pallets.length >= this.tune.stagingCapacity; });
    this.state.stats.reworks += 1; Sound.play("restock");
    this.scoring.add(this.tune.scores.rework, "rework");
    this.alerts.push("Mixed lane reworked into clean groups.", "good");
  }

  resetLane(lane) { lane.pallets = []; lane.colorKey = null; lane.color = null; lane.mixed = false; lane.ready = false; lane.reserved = false; lane.jamClock = 0; }
}

/* ---------------- RC: the player's forklift (task-target control) ----------- */
class RcController {
  constructor(state, staging, scoring, alerts, tune) {
    this.state = state; this.staging = staging; this.scoring = scoring; this.alerts = alerts; this.tune = tune;
  }
  queueRoom() { const rc = this.state.rc; return (rc.job ? 1 : 0) + rc.queue.length < this.tune.rcQueueMax + 1; }
  baseQueued(base) { const rc = this.state.rc; return (rc.job && rc.job.base === base) || rc.queue.some((j) => j.base === base); }

  requestHaulAt(base) {
    if (this.baseQueued(base)) return;
    let pallet = null, partial = false;
    if (base.fullPallet) pallet = base.fullPallet;
    else if (this.state.partialArmed && base.empty && !base.blocked && base.boxes >= this.tune.partialMinBoxes) { pallet = { colorKey: base.colorKey, color: base.color }; partial = true; }
    if (!pallet) { this.alerts.push("Nothing to haul there yet.", "info"); Sound.play("deny"); return; }
    let dest, lane = null;
    if (pallet.colorKey === "Blue") {
      if (this.state.ibt.count >= this.tune.ibtCapacity) { this.alerts.push("IBT is full — clear it before hauling blue.", "warn"); Sound.play("deny"); return; }
      dest = "ibt";
    } else {
      lane = this.staging.findLane(pallet);
      if (!lane) { this.alerts.push("No open staging lane — wait for GPM or rework.", "warn"); Sound.play("deny"); return; }
      lane.reserved = true; dest = "lane";
    }
    if (!this.queueRoom()) { if (lane) lane.reserved = false; this.alerts.push("RC is busy — finish current hauls first.", "warn"); Sound.play("deny"); return; }
    this.state.rc.queue.push({ type: partial ? "partial" : "haul", base, pallet, dest, lane, phase: "pickup" });
    if (this.state.partialArmed) this.state.partialArmed = false;
    Sound.play("select");
  }

  requestRaaPrep(sideKey) {
    const side = this.state.sides[sideKey];
    const max = side.raaStackingLocked ? 1 : this.tune.raaPrepCapacity;
    if (side.raaPrep >= max) { this.alerts.push(`${side.label} RAA ${side.raaStackingLocked ? "locked" : "buffer full"}.`, "warn"); Sound.play("deny"); return; }
    if (!this.queueRoom()) { this.alerts.push("RC is busy.", "warn"); Sound.play("deny"); return; }
    this.state.rc.queue.push({ type: "raaPrep", sideKey, phase: "go" });
    Sound.play("select");
  }
  requestRestock() {
    if (!this.queueRoom()) { this.alerts.push("RC is busy.", "warn"); Sound.play("deny"); return; }
    this.state.rc.queue.push({ type: "restock", phase: "go" });
    Sound.play("select");
  }

  targetFor(job) {
    if (job.type === "haul" || job.type === "partial") {
      if (job.phase === "pickup") return basePos(job.base.sideKey, job.base.index);
      return job.dest === "ibt" ? center(zoneOf("ibt")) : lanePos(job.lane.index, this.tune.stagingLanes);
    }
    if (job.type === "raaPrep") return center(zoneOf(`raa${cap1(job.sideKey)}`));
    if (job.type === "restock") return center(zoneOf("emptyTrailer"));
    return rcHome();
  }

  update(delta) {
    const rc = this.state.rc, dt = delta / 1000;
    if (!rc.job && rc.queue.length) { rc.job = rc.queue.shift(); const t = this.targetFor(rc.job); rc.tx = t.x; rc.ty = t.y; }
    if (rc.dwell > 0) { rc.dwell -= delta; rc.moving = false; if (rc.dwell <= 0) this.finishDwell(); rc.status = this.statusText(); return; }
    const t = rc.job ? this.targetFor(rc.job) : rcHome();
    rc.tx = t.x; rc.ty = t.y;
    const dx = t.x - rc.x, dy = t.y - rc.y, d = Math.hypot(dx, dy);
    if (d > 2) {
      const step = Math.min(d, this.tune.rcWorkerSpeed * dt);
      rc.x += (dx / d) * step; rc.y += (dy / d) * step; rc.moving = true;
      if (Math.abs(dx) > 1) rc.facing = dx < 0 ? -1 : 1;
    } else { rc.moving = false; if (rc.job) this.onArrive(); }
    rc.status = this.statusText();
  }

  onArrive() {
    const rc = this.state.rc, j = rc.job;
    if (j.type === "haul" || j.type === "partial") {
      if (j.phase === "pickup") {
        const b = j.base;
        b.fullPallet = null; b.empty = false; b.blocked = true; b.boxes = 0; b.colorKey = null; b.color = null; b.incoming = 0;
        rc.carry = j.pallet; j.phase = "deliver"; Sound.play("beep"); return;
      }
      if (j.dest === "ibt") {
        if (this.state.ibt.count >= this.tune.ibtCapacity) { this.state.stats.ibtOverflow += 1; this.scoring.add(this.tune.scores.ibtOverflow, "IBT overflow"); }
        else { this.state.ibt.count += 1; this.scoring.add(this.tune.scores.ibtStage, "blue → IBT", rc.x, rc.y); }
      } else {
        j.lane.reserved = false; this.staging.addToLane(j.lane, j.pallet);
      }
      this.state.stats.hauls += 1;
      this.scoring.add(j.type === "partial" ? this.tune.scores.partialShip : this.tune.scores.haul, j.type === "partial" ? "partial ship" : "haul");
      if (j.type === "partial") this.state.stats.partialShips += 1;
      Sound.play("palletDrop");
      this.endJob(); return;
    }
    if (j.type === "raaPrep") { rc.dwell = this.tune.raaPrepMs; return; }
    if (j.type === "restock") {
      this.state.emptyStacks.primary.count = this.tune.emptyStackCapacity;
      this.state.emptyStacks.secondary.count = this.tune.emptyStackCapacity;
      this.state.stats.emptyRestocks += 1; Sound.play("restock");
      this.alerts.push("Restocked both empty pallet stacks.", "good");
      this.endJob(); return;
    }
  }

  finishDwell() {
    const j = this.state.rc.job; if (!j) return;
    if (j.type === "raaPrep") {
      const side = this.state.sides[j.sideKey];
      const max = side.raaStackingLocked ? 1 : this.tune.raaPrepCapacity;
      if (side.raaPrep < max) { side.raaPrep += 1; Sound.play("raaPrep"); this.scoring.add(this.tune.scores.raaPrep, `${side.label} RAA prep`); this.alerts.push(`${side.label} RAA pallet prepped.`, "good"); }
      this.endJob();
    }
  }

  endJob() { const rc = this.state.rc; rc.job = null; rc.carry = null; const h = rcHome(); rc.tx = h.x; rc.ty = h.y; }

  statusText() {
    const rc = this.state.rc;
    if (!rc.job) return rc.moving ? "Returning" : "Idle — awaiting orders";
    const j = rc.job;
    if (j.type === "raaPrep") return rc.dwell > 0 ? "Prepping RAA" : `To ${j.sideKey} RAA`;
    if (j.type === "restock") return "To empty trailer";
    if (j.phase === "pickup") return j.type === "partial" ? "To partial pallet" : "To full pallet";
    return j.dest === "ibt" ? "Hauling blue → IBT" : "Hauling → staging";
  }
}

function center(z) { return { x: z.x, y: z.y }; }
function cap1(s) { return s[0].toUpperCase() + s.slice(1); }

/* ---------------- Sim facade ---------------- */
class Sim {
  constructor(scenario) {
    this.scenario = scenario || SCENARIOS[0];
    this.tune = Object.assign({}, TUNE, this.scenario.tune || {});
    this.tune.scores = TUNE.scores;
    if (this.scenario.tune && this.scenario.tune.offerBlue) this.tune.offerBlue = this.scenario.tune.offerBlue;
    this.table = freightTable(this.tune.blueWeight);
    this.state = new GameState(this.tune, this.table);
    this.alerts = new AlertManager();
    this.scoring = new ScoringManager(this.state, this.alerts, this.tune);
    this.workers = new WorkerManager(this.state, this.alerts, this.tune);
    this.workers.scoring = this.scoring;
    this.flow = new FlowManager(this.state, this.workers, this.scoring, this.alerts, this.tune);
    this.staging = new StagingManager(this.state, this.workers, this.scoring, this.alerts, this.tune);
    this.rc = new RcController(this.state, this.staging, this.scoring, this.alerts, this.tune);
  }

  update(delta) {
    const s = this.state;
    if (s.gameOver || s.paused) return;
    s.shiftRemaining = Math.max(0, s.shiftRemaining - delta);
    this.workers.update(delta);
    this.flow.update(delta);
    this.rc.update(delta);
    this.staging.update(delta);
    this.alerts.update(delta);
    s.sampleClock += delta; s.utilSum += this.workers.utilization(); s.utilCount += 1;
    if (s.sampleClock >= 1000) { s.sampleClock = 0; s.flowTimeline.push(Math.round(s.flowHealth)); }
    if (s.shiftRemaining <= 0 && !s.gameOver) { s.gameOver = true; Sound.play("shiftEnd"); }
    Object.values(s.sides).forEach((sd) => sd.bases.forEach((b) => { if (b.pop > 0) b.pop = Math.max(0, b.pop - 0.05); }));
    s.staging.lanes.forEach((l) => { if (l.pop > 0) l.pop = Math.max(0, l.pop - 0.05); });
  }

  avgFlow() { const f = this.state.flowSamples; return f.length ? f.reduce((a, b) => a + b, 0) / f.length : this.state.flowHealth; }
  avgUtil() { return this.state.utilCount ? (this.state.utilSum / this.state.utilCount) * 100 : 0; }

  evaluate() {
    const s = this.state, sc = this.scenario, avg = this.avgFlow();
    const objResults = (sc.objectives || []).map((o) => {
      let pass = false, value = 0;
      if (o.kind === "finalFlow") { value = Math.round(s.flowHealth); pass = value >= o.target; }
      else if (o.kind === "avgFlow") { value = Math.round(avg); pass = value >= o.target; }
      else if (o.kind === "avgUtil") { value = Math.round(this.avgUtil()); pass = value >= o.target; }
      else if (o.kind === "stat") { value = s.stats[o.stat] || 0; pass = value >= o.target; }
      else if (o.kind === "statMax") { value = s.stats[o.stat] || 0; pass = value <= o.target; }
      return { label: o.label, pass, value };
    });
    const allObj = objResults.every((o) => o.pass);
    let stars = 1;
    if (avg >= (sc.star2Flow || 70)) stars = 2;
    if (allObj && avg >= (sc.star3Flow || 85)) stars = 3;
    return { stars, avgFlow: avg, score: s.score, objectives: objResults, allObjectives: allObj, stats: s.stats, timeline: s.flowTimeline.slice() };
  }
}

window.Sim = Sim;
