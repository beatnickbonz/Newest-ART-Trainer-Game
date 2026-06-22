/* =============================================================================
 * Simulation core (Phaser-free). State + managers for workers, freight flow,
 * staging, scoring, and alerts. The renderer and UI read from this; commands
 * are issued into it. Bundled behind a single `Sim` facade.
 * ===========================================================================*/

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

class GameState {
  constructor(tune, table) {
    this.tune = tune;
    this.table = table;
    this.score = 0;
    this.flowHealth = 100;
    this.flowSamples = [];
    this.flowTimeline = [];     // sparse samples for the results graph
    this.shiftRemaining = tune.shiftMs;
    this.shiftTotal = tune.shiftMs;
    this.gameOver = false;
    this.paused = false;
    this.utilSum = 0;
    this.utilCount = 0;
    this.sampleClock = 0;
    this.stats = {
      cleanPallets: 0, cleanLanes: 0, mixedMistakes: 0, blockedTicks: 0,
      smoothRaa: 0, missedRaa: 0, manualGpm: 0, ibtOverflow: 0,
      emptyRestocks: 0, reworks: 0, trailers: 0, ibtCleared: 0, gpmPicks: 0,
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
  }

  makeSide(key, label, spawnMs) {
    const t = this.tune;
    return {
      key, label, source: "ART", spawnMs, spawnClock: 0,
      artBacklog: t.artCapacity, refillTimer: 0,
      raaBoxes: 0, raaPrep: 0, raaStarved: false, raaStackingLocked: false,
      inbound: [], processBank: 0, blockedClock: 0, starvationClock: 0,
      forecast: Array.from({ length: t.forecastSize }, () => pickFreight(this.table)),
      bases: Array.from({ length: t.baseCount }, (_, i) => ({
        index: i, colorKey: null, color: null, boxes: 0,
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
  update(delta) {
    this.items.forEach((i) => (i.age += delta));
    this.items = this.items.filter((i) => i.age < i.life);
  }
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

class ZoneManager {
  constructor() { this.zones = ZONES; }
  get(a) { return zoneOf(a); }
}

class WorkerManager {
  constructor(state, zones, alerts, tune) {
    this.state = state; this.zones = zones; this.alerts = alerts; this.tune = tune;
    this.selected = null;
    const names = ROSTER_NAMES.slice(0, tune.staff);
    this.workers = names.map((name, i) => ({
      id: i + 1, name,
      efficiency: 0.82 + (i % 4) * 0.08,
      assignment: "idle", status: "Idle",
      x: 560 + i * 26, y: 648, tx: 560 + i * 26, ty: 648,
      job: null, facing: 1, moving: false, carry: null, bob: Math.random() * 6,
    }));
  }

  select(worker) {
    this.selected = worker;
    Sound.play("select");
    this.alerts.push(`${worker.name} selected — click a zone to assign.`, "info");
  }
  selectById(id) { const w = this.workers.find((x) => x.id === id); if (w) this.select(w); }

  assignSelected(assignment) {
    if (!this.selected) { this.alerts.push("Select a worker first, then click a zone.", "warn"); return false; }
    return this.assign(this.selected, assignment);
  }

  assign(worker, assignment) {
    const zone = this.zones.get(assignment);
    if (!zone && assignment !== "idle") return false;
    if (zone?.noWorkerAssignment || assignment === "ibt") {
      this.alerts.push(assignment === "emptyTrailer"
        ? "Select the RC operator, then click the empty trailer to restock."
        : "Drop/supply zone — not a worker post.", "info");
      Sound.play("deny");
      return false;
    }
    if (assignment === "staging") {
      const rc = this.workers.find((w) => w !== worker && w.assignment === "staging");
      if (rc) { this.alerts.push(`${rc.name} already holds RC operator — only one allowed.`, "warn"); Sound.play("deny"); return false; }
    }
    worker.assignment = assignment;
    worker.status = ASSIGNMENT_LABELS[assignment] || "Working";
    const offset = ((worker.id % 5) - 2) * 14;
    worker.tx = zone ? zone.x + offset : 640 + offset;
    worker.ty = zone ? zone.y + zone.h / 2 - 26 + (worker.id % 2) * 14 : 648;
    Sound.play("assign");
    this.alerts.push(`${worker.name} → ${worker.status}.`, "good");
    return true;
  }

  productivity(assignment) {
    return this.workers
      .filter((w) => w.assignment === assignment && !w.job && this.atTarget(w))
      .reduce((s, w) => s + w.efficiency, 0);
  }
  availableForJob(assignments) {
    return this.workers.find((w) => assignments.includes(w.assignment) && !w.job && this.atTarget(w));
  }
  utilization() {
    const active = this.workers.filter((w) => w.assignment !== "idle").length;
    return active / this.workers.length;
  }
  rc() { return this.workers.find((w) => w.assignment === "staging"); }
  atTarget(w) { return dist(w.x, w.y, w.tx, w.ty) < 8; }

  update(delta) {
    const dt = delta / 1000;
    this.workers.forEach((w) => {
      const dx = w.tx - w.x, dy = w.ty - w.y;
      const d = Math.hypot(dx, dy);
      if (d > 2) {
        const speed = w.assignment === "staging" ? this.tune.rcWorkerSpeed : this.tune.workerSpeed;
        const step = Math.min(d, speed * dt);
        w.x += (dx / d) * step; w.y += (dy / d) * step;
        w.moving = true;
        if (Math.abs(dx) > 1) w.facing = dx < 0 ? -1 : 1;
        w.status = w.job ? w.job.status : `Moving · ${ASSIGNMENT_LABELS[w.assignment] || "Zone"}`;
      } else {
        w.moving = false;
        w.status = w.job ? w.job.status : ASSIGNMENT_LABELS[w.assignment] || "Idle";
      }
      w.carry = w.job && (w.job.phase === "dropoff" || w.job.phase === "return") ? (w.job.pallet || w.job.carry || { generic: true }) : null;
    });
  }
}

class FlowManager {
  constructor(state, workers, scoring, alerts, tune, table) {
    this.state = state; this.workers = workers; this.scoring = scoring;
    this.alerts = alerts; this.tune = tune; this.table = table;
  }

  update(delta) {
    this.updateEmptyPalletJobs();
    this.updateSide(this.state.sides.primary, delta);
    this.updateSide(this.state.sides.secondary, delta);
    this.dispatchEmptyPalletJobs();
    this.updateFlowHealth(delta);
  }

  updateSide(side, delta) {
    side.spawnClock += delta;
    if (side.refillTimer > 0) {
      side.refillTimer = Math.max(0, side.refillTimer - delta);
      if (side.refillTimer === 0) {
        side.artBacklog = this.tune.artCapacity;
        side.raaStarved = false; side.raaStackingLocked = false;
        Sound.play("trailer");
        this.alerts.push(`${side.label} ART trailer docked.`, "good");
      }
    }
    while (side.spawnClock >= side.spawnMs && this.sourceReady(side)) {
      side.spawnClock -= side.spawnMs;
      this.generateFreight(side);
    }
    if (!this.hasSource(side)) side.spawnClock = Math.min(side.spawnClock, side.spawnMs);

    const labor = this.workers.productivity(side.key) + this.workers.productivity("floater") * 0.45;
    side.processBank += labor * delta * 0.006;
    while (side.processBank >= 1 && side.inbound.length > 0) {
      if (!this.processOneBox(side)) break;
      side.processBank -= 1;
    }

    if (side.inbound.length > 12 || side.bases.some((b) => b.blocked)) {
      side.blockedClock += delta;
      if (side.blockedClock > 3500) {
        side.blockedClock = 0; this.state.stats.blockedTicks += 1;
        this.scoring.add(this.tune.scores.blockedTick, `${side.label} bottleneck`);
      }
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
      this.alerts.push(`${side.label} RAA is dry — send the RC to prep backup.`, "bad");
    }
    return false;
  }

  hasSource(side) {
    if (side.source === "ART") return side.artBacklog > 0 && side.refillTimer <= 0;
    return side.raaBoxes > 0 || side.raaPrep > 0;
  }

  generateFreight(side) {
    if (side.source === "ART") {
      side.artBacklog -= 1;
      if (side.artBacklog === 0) {
        if (side.raaPrep <= 0 && side.raaBoxes <= 0) side.raaStackingLocked = true;
        this.alerts.push(`${side.label} ART empty — switch to RAA or request a trailer.`, "warn");
      }
    } else side.raaBoxes -= 1;
    const f = side.forecast.shift();
    side.forecast.push(pickFreight(this.table));
    side.inbound.push(f);
  }

  processOneBox(side) {
    const f = side.inbound[0];
    const base = this.findBase(side, f);
    if (!base) return false;
    side.inbound.shift();
    base.colorKey = f.key; base.color = f.color; base.boxes += 1; base.pop = 1;
    if (base.boxes >= this.tune.baseCapacity) {
      base.fullPallet = { colorKey: base.colorKey, color: base.color, side: side.key };
      base.blocked = true;
      Sound.play("beep");
    }
    return true;
  }

  findBase(side, f) {
    const same = side.bases.find((b) => b.empty && !b.blocked && b.colorKey === f.key && b.boxes < this.tune.baseCapacity);
    if (same) return same;
    return side.bases.find((b) => b.empty && !b.blocked && b.boxes === 0 && b.colorKey === null);
  }

  updateEmptyPalletJobs() {
    this.workers.workers.forEach((w) => {
      const job = w.job;
      if (job?.system !== "emptyPallet" || !this.workers.atTarget(w)) return;
      if (job.phase === "pickup") {
        const stack = this.state.emptyStacks[job.sideKey];
        if (stack.count <= 0) {
          w.job = null; const h = zoneHome(w.assignment); w.tx = h.x; w.ty = h.y;
          this.alerts.push(`${job.sideLabel} empty stack is out — restock with RC.`, "warn");
          return;
        }
        stack.count -= 1; job.phase = "dropoff"; job.status = `Carrying empty → ${job.sideLabel}`;
        w.tx = job.dropX; w.ty = job.dropY; return;
      }
      if (job.phase === "dropoff") {
        job.base.empty = true; job.base.blocked = false; job.base.fullPallet = null;
        w.job = null; const h = zoneHome(w.assignment); w.tx = h.x; w.ty = h.y;
        this.scoring.add(this.tune.scores.emptyPallet, "empty set");
      }
    });
  }

  dispatchEmptyPalletJobs() {
    Object.values(this.state.sides).forEach((side) => {
      if (this.state.emptyStacks[side.key].count <= 0) return;
      side.bases.forEach((base) => {
        if (base.empty || !base.blocked || base.fullPallet || this.baseHasEmptyJob(base)) return;
        const w = this.workers.availableForJob([side.key]);
        if (!w) return;
        const pickup = stackPos(side.key);
        const drop = basePos(side.key, base.index);
        w.job = { system: "emptyPallet", phase: "pickup", sideKey: side.key, sideLabel: side.label, base, dropX: drop.x, dropY: drop.y, status: `Walking to ${side.label} empties` };
        w.tx = pickup.x; w.ty = pickup.y;
      });
    });
  }
  baseHasEmptyJob(base) { return this.workers.workers.some((w) => w.job?.system === "emptyPallet" && w.job.base === base); }

  updateFlowHealth(delta) {
    const p = this.state.sides.primary, s = this.state.sides.secondary;
    const inbound = p.inbound.length + s.inbound.length;
    const completed = this.waiting(p) + this.waiting(s);
    const blocked = [...p.bases, ...s.bases].filter((b) => b.blocked).length;
    const missing = [...p.bases, ...s.bases].filter((b) => !b.empty && b.blocked && !b.fullPallet).length;
    const mixed = this.state.staging.lanes.filter((l) => l.mixed).length;
    const ibtP = this.state.ibt.count >= this.tune.ibtCapacity ? 18 : this.state.ibt.count >= 8 ? 8 : 0;
    const srcP = (p.source === "ART" && p.artBacklog <= 0 ? 12 : 0) + (s.source === "ART" && s.artBacklog <= 0 ? 12 : 0);
    const idleP = (1 - this.workers.utilization()) * 8;
    const pressure = inbound * 1.25 + completed * 2.2 + blocked * 8 + missing * 5 + mixed * 7 + ibtP + srcP + idleP;
    const target = clamp(100 - pressure, 0, 100);
    this.state.flowHealth += (target - this.state.flowHealth) * Math.min(1, delta / 1200);
    this.state.flowSamples.push(this.state.flowHealth);
    if (this.state.flowSamples.length > 1200) this.state.flowSamples.shift();
  }
  waiting(side) { return side.bases.filter((b) => b.fullPallet).length; }

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

  requestTrailer(sideKey) {
    const side = this.state.sides[sideKey];
    if (side.artBacklog > 0 || side.refillTimer > 0) { this.alerts.push(`${side.label} trailer request unavailable.`, "warn"); Sound.play("deny"); return; }
    side.refillTimer = this.tune.artRefillMs; this.state.stats.trailers += 1;
    this.scoring.add(this.tune.scores.trailerRequest, `${side.label} trailer`);
    Sound.play("click");
    this.alerts.push(`${side.label} trailer requested — dock turn started.`, "good");
  }
}

class StagingManager {
  constructor(state, workers, scoring, alerts, tune) {
    this.state = state; this.workers = workers; this.scoring = scoring; this.alerts = alerts; this.tune = tune;
  }

  update(delta) {
    this.updateTransportJobs(delta);
    this.dispatchTransportJobs();
    this.updateGpm(delta);
    this.updateIbt(delta);
    if (this.state.staging.gpmFlash > 0) this.state.staging.gpmFlash = Math.max(0, this.state.staging.gpmFlash - delta);
  }

  updateTransportJobs(delta) {
    this.workers.workers.forEach((w) => {
      const job = w.job;
      if (!job || !["transport", "rcRestock", "rcRaaPrep"].includes(job.system)) return;
      if (job.system === "rcRaaPrep" && job.phase === "prep") {
        job.timer = Math.max(0, job.timer - delta);
        if (job.timer > 0) return;
        const side = this.state.sides[job.sideKey];
        const maxPrep = side.raaStackingLocked ? 1 : this.tune.raaPrepCapacity;
        if (side.raaPrep < maxPrep) {
          side.raaPrep += 1; Sound.play("raaPrep");
          this.scoring.add(this.tune.scores.raaPrep, `${side.label} RAA prep`);
          this.alerts.push(`${side.label} RAA pallet prepped (10 boxes).`, "good");
        }
        job.phase = "return"; job.status = "RC returning from RAA prep"; w.tx = job.dropX; w.ty = job.dropY; return;
      }
      if (!this.workers.atTarget(w)) return;
      if (job.system === "rcRestock") {
        if (job.phase === "pickup") {
          this.state.emptyStacks.primary.count = this.tune.emptyStackCapacity;
          this.state.emptyStacks.secondary.count = this.tune.emptyStackCapacity;
          this.state.stats.emptyRestocks += 1; Sound.play("restock");
          job.phase = "return"; job.status = "RC returning from empty trailer"; w.tx = job.dropX; w.ty = job.dropY;
          this.alerts.push("RC restocked both empty pallet stacks.", "good"); return;
        }
        w.job = null; const h = zoneHome(w.assignment); w.tx = h.x; w.ty = h.y; return;
      }
      if (job.system === "rcRaaPrep") {
        if (job.phase === "travel") { job.phase = "prep"; job.timer = this.tune.raaPrepMs; job.status = "RC prepping RAA"; return; }
        w.job = null; const h = zoneHome(w.assignment); w.tx = h.x; w.ty = h.y; return;
      }
      // transport (full pallets)
      if (job.phase === "pickup") {
        job.phase = "dropoff"; job.status = job.type === "ibt" ? "RC → IBT (blue)" : "RC → staging";
        job.base.fullPallet = null; job.base.colorKey = null; job.base.color = null; job.base.boxes = 0; job.base.empty = false; job.base.blocked = true;
        Sound.play("beep"); w.tx = job.dropX; w.ty = job.dropY; return;
      }
      if (job.phase === "dropoff") {
        if (job.type === "ibt") {
          if (this.state.ibt.count >= this.tune.ibtCapacity) { this.state.stats.ibtOverflow += 1; this.scoring.add(this.tune.scores.ibtOverflow, "IBT overflow"); }
          else { this.state.ibt.count += 1; this.scoring.add(this.tune.scores.ibtStage, "blue → IBT", w.x, w.y); }
        } else { job.lane.reserved = false; this.addToLane(job.lane, job.pallet); }
        Sound.play("palletDrop");
        w.job = null; const h = zoneHome(w.assignment); w.tx = h.x; w.ty = h.y;
      }
    });
  }

  dispatchTransportJobs() {
    Object.values(this.state.sides).forEach((side) => {
      side.bases.forEach((base) => {
        if (!base.fullPallet || this.baseHasJob(base)) return;
        const pallet = base.fullPallet;
        const pickup = basePos(side.key, base.index);
        if (pallet.colorKey === "Blue") {
          const w = this.workers.availableForJob(["staging"]);
          if (!w || this.state.ibt.count >= this.tune.ibtCapacity) return;
          const drop = zoneOf("ibt");
          this.startJob(w, { type: "ibt", sideKey: side.key, base, pallet, pickupX: pickup.x, pickupY: pickup.y, dropX: drop.x, dropY: drop.y, status: "RC to blue pallet" });
          return;
        }
        const lane = this.findLane(pallet);
        const w = this.workers.availableForJob(["staging"]);
        if (!lane || !w) return;
        const lp = lanePos(lane.index, this.tune.stagingLanes);
        this.startJob(w, { type: "staging", sideKey: side.key, base, lane, pallet, pickupX: pickup.x, pickupY: pickup.y, dropX: lp.x, dropY: lp.y, status: "RC to full pallet" });
      });
    });
  }

  startJob(w, job) {
    job.system = "transport"; job.phase = "pickup";
    if (job.lane) job.lane.reserved = true;
    w.job = job; w.status = job.status; w.tx = job.pickupX; w.ty = job.pickupY;
  }

  requestEmptyPalletRestock() {
    const w = this.workers.selected;
    if (!w || w.assignment !== "staging") { this.alerts.push("Select the RC operator, then click the empty trailer.", "warn"); Sound.play("deny"); return; }
    if (w.job) { this.alerts.push("RC operator is already on a trip.", "warn"); Sound.play("deny"); return; }
    const trailer = zoneOf("emptyTrailer"); const h = zoneHome("staging");
    w.job = { system: "rcRestock", phase: "pickup", status: "RC → empty trailer", dropX: h.x, dropY: h.y };
    w.tx = trailer.x; w.ty = trailer.y; Sound.play("click");
    this.alerts.push("RC dispatched to restock empties.", "info");
  }

  requestRaaPrep(sideKey) {
    const w = this.workers.selected; const side = this.state.sides[sideKey];
    const maxPrep = side.raaStackingLocked ? 1 : this.tune.raaPrepCapacity;
    if (!w || w.assignment !== "staging") { this.alerts.push("Select the RC operator, then click an RAA prep zone.", "warn"); Sound.play("deny"); return; }
    if (w.job) { this.alerts.push("RC operator is already on a trip.", "warn"); Sound.play("deny"); return; }
    if (side.raaPrep >= maxPrep) { this.alerts.push(`${side.label} RAA unavailable: ${side.raaStackingLocked ? "stacking lost after dry-out" : "prep buffer full"}.`, "warn"); Sound.play("deny"); return; }
    const zone = zoneOf(`raa${sideKey[0].toUpperCase()}${sideKey.slice(1)}`); const h = zoneHome("staging");
    w.job = { system: "rcRaaPrep", phase: "travel", sideKey, status: `RC → ${side.label} RAA`, dropX: h.x, dropY: h.y };
    w.tx = zone.x; w.ty = zone.y; Sound.play("click");
    this.alerts.push(`RC dispatched to ${side.label} RAA prep.`, "info");
  }

  baseHasJob(base) { return this.workers.workers.some((w) => w.job?.base === base); }

  findLane(pallet) {
    const L = this.state.staging.lanes;
    return L.find((l) => !l.reserved && !l.mixed && !l.ready && l.colorKey === pallet.colorKey && l.pallets.length < this.tune.stagingCapacity)
      || L.find((l) => !l.reserved && l.pallets.length === 0)
      || L.find((l) => !l.reserved && !l.ready && l.pallets.length > 0 && l.pallets.length < this.tune.stagingCapacity);
  }

  addToLane(lane, pallet) {
    if (lane.pallets.length === 0) { lane.colorKey = pallet.colorKey; lane.color = pallet.color; }
    if (lane.colorKey !== pallet.colorKey) {
      lane.mixed = true; lane.ready = false; lane.jamClock = 0;
      this.state.stats.mixedMistakes += 1;
      this.scoring.add(this.tune.scores.mixedLane, "mixed lane");
      this.alerts.push(`Lane ${lane.label} mixed — rework or GPM needed.`, "warn");
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
    return Object.values(this.state.sides).some((side) => {
      const counts = new Map();
      side.forecast.slice(0, 5).forEach((f) => { if (f.key !== "Blue") counts.set(f.key, (counts.get(f.key) || 0) + 1); });
      return (counts.get(colorKey) || 0) >= 2;
    });
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
      if (lane.mixed) { lane.jamClock += this.tune.gpmMs; if (lane.jamClock >= 11000) { lane.jamClock = 0; this.scoring.add(-20, "mixed lane jam"); } }
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

class Sim {
  constructor(scenario) {
    this.scenario = scenario || SCENARIOS[0];
    this.tune = Object.assign({}, TUNE, this.scenario.tune || {});
    this.tune.scores = TUNE.scores;
    this.table = freightTable(this.tune.blueWeight);
    this.state = new GameState(this.tune, this.table);
    this.alerts = new AlertManager();
    this.scoring = new ScoringManager(this.state, this.alerts, this.tune);
    this.zones = new ZoneManager();
    this.workers = new WorkerManager(this.state, this.zones, this.alerts, this.tune);
    this.flow = new FlowManager(this.state, this.workers, this.scoring, this.alerts, this.tune, this.table);
    this.staging = new StagingManager(this.state, this.workers, this.scoring, this.alerts, this.tune);
  }

  update(delta) {
    const s = this.state;
    if (s.gameOver || s.paused) return;
    s.shiftRemaining = Math.max(0, s.shiftRemaining - delta);
    this.workers.update(delta);
    this.flow.update(delta);
    this.staging.update(delta);
    this.alerts.update(delta);
    // metric sampling for objectives + results graph
    s.sampleClock += delta;
    s.utilSum += this.workers.utilization(); s.utilCount += 1;
    if (s.sampleClock >= 1000) { s.sampleClock = 0; s.flowTimeline.push(Math.round(s.flowHealth)); }
    if (s.shiftRemaining <= 0 && !s.gameOver) { s.gameOver = true; Sound.play("shiftEnd"); }
  }

  avgFlow() {
    const f = this.state.flowSamples;
    return f.length ? f.reduce((a, b) => a + b, 0) / f.length : this.state.flowHealth;
  }
  avgUtil() { return this.state.utilCount ? (this.state.utilSum / this.state.utilCount) * 100 : 0; }

  /* Evaluate scenario objectives + compute stars. */
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
    if (avg < 35 && !allObj) stars = Math.max(stars, 1);
    return { stars, avgFlow: avg, score: s.score, objectives: objResults, allObjectives: allObj, stats: s.stats, timeline: s.flowTimeline.slice() };
  }
}

window.Sim = Sim;
