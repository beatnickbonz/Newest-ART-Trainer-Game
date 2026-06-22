const W = 1280;
const H = 720;

const COLORS = {
  bg: 0x10171a,
  floor: 0x555b55,
  floorDark: 0x464d49,
  panel: 0x101a21,
  panel2: 0x17242d,
  line: 0x344650,
  text: "#e5edf2",
  muted: "#91a7b1",
  cyan: 0x38bdf8,
  yellow: 0xfacc15,
  green: 0x22c55e,
  red: 0xef4444,
  orange: 0xf97316,
  purple: 0x7c3aed,
  brown: 0xb8793a,
  blue: 0x0ea5e9,
  white: 0xf8fafc,
};

const FREIGHT = [
  { key: "Brown", color: COLORS.brown, weight: 40 },
  { key: "Red", color: COLORS.red, weight: 20 },
  { key: "Orange", color: COLORS.orange, weight: 15 },
  { key: "Purple", color: COLORS.purple, weight: 15 },
  { key: "Blue", color: COLORS.blue, weight: 10 },
];

const TUNE = {
  shiftMs: 8 * 60 * 1000,
  artCapacity: 100,
  primarySpawnMs: 900,
  secondarySpawnMs: 2200,
  artRefillMs: 45000,
  raaPalletBoxes: 10,
  raaPrepCapacity: 5,
  raaPrepMs: 2000,
  raaFeedMs: 1500,
  baseCount: 5,
  baseCapacity: 6,
  stagingLanes: 5,
  stagingCapacity: 3,
  ibtCapacity: 10,
  ibtClearMs: 15000,
  gpmMs: 3600,
  gpmChance: 0.55,
  forecastSize: 8,
  emptyStackCapacity: 7,
  workerSpeed: 220,
  rcWorkerSpeed: 310,
  flowWarning: 70,
  flowCritical: 40,
  scores: {
    cleanStage: 120,
    hotStage: 60,
    ibtStage: 140,
    gpmClear: 35,
    raaPrep: 35,
    smoothRaa: 125,
    emptyPallet: 10,
    trailerRequest: 35,
    rework: -45,
    manualGpm: -75,
    mixedLane: -35,
    starvation: -35,
    blockedTick: -25,
    ibtOverflow: -35,
  },
};

const ZONES = [
  { id: "primary", label: "Primary ART", assignment: "primary", x: 300, y: 250, w: 230, h: 250, color: COLORS.cyan },
  { id: "secondary", label: "Secondary ART", assignment: "secondary", x: 980, y: 250, w: 230, h: 250, color: COLORS.purple },
  { id: "raaPrimary", label: "P RAA Prep", assignment: "raaPrimary", x: 300, y: 532, w: 200, h: 78, color: COLORS.yellow, noWorkerAssignment: true },
  { id: "raaSecondary", label: "S RAA Prep", assignment: "raaSecondary", x: 980, y: 532, w: 200, h: 78, color: COLORS.yellow, noWorkerAssignment: true },
  { id: "staging", label: "Shared Staging", assignment: "staging", x: 640, y: 420, w: 430, h: 185, color: COLORS.green },
  { id: "ibt", label: "IBT Blue", assignment: "ibt", x: 910, y: 606, w: 230, h: 78, color: COLORS.blue, noWorkerAssignment: true },
  { id: "primaryStack", label: "P Empty Stack", assignment: "primaryStack", x: 300, y: 395, w: 170, h: 54, color: COLORS.brown, noWorkerAssignment: true },
  { id: "secondaryStack", label: "S Empty Stack", assignment: "secondaryStack", x: 980, y: 395, w: 170, h: 54, color: COLORS.brown, noWorkerAssignment: true },
  { id: "emptyTrailer", label: "Empty Trailer", assignment: "emptyTrailer", x: 500, y: 608, w: 150, h: 62, color: COLORS.brown, noWorkerAssignment: true },
  { id: "floater", label: "Floater", assignment: "floater", x: 640, y: 608, w: 190, h: 60, color: COLORS.white },
];

const ASSIGNMENT_LABELS = {
  idle: "Idle",
  primary: "Working Primary",
  secondary: "Working Secondary",
  staging: "RC Operator",
  floater: "Floater",
};

const WORKER_SHEET = {
  key: "workerSheet",
  path: "assets/worker_sprites_v2.png",
  frameWidth: 96,
  frameHeight: 128,
  scale: 0.34,
};

const RC_SHEET = {
  key: "rcOperatorSheet",
  path: "assets/rc_operator_sprites.png",
  frameWidth: 144,
  frameHeight: 112,
  scale: 0.58,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(ms) {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(safe / 60);
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function pickFreight() {
  const roll = Math.random() * 100;
  let cursor = 0;
  for (const freight of FREIGHT) {
    cursor += freight.weight;
    if (roll <= cursor) return freight;
  }
  return FREIGHT[0];
}

class GameState {
  constructor() {
    this.score = 0;
    this.flowHealth = 100;
    this.flowSamples = [];
    this.shiftRemaining = TUNE.shiftMs;
    this.gameOver = false;
    this.stats = {
      cleanPallets: 0,
      mixedMistakes: 0,
      blockedTicks: 0,
      smoothRaa: 0,
      missedRaa: 0,
      manualGpm: 0,
      ibtOverflow: 0,
      emptyRestocks: 0,
      reworks: 0,
      idleSeconds: 0,
    };
    this.emptyStacks = {
      primary: { count: TUNE.emptyStackCapacity, capacity: TUNE.emptyStackCapacity },
      secondary: { count: TUNE.emptyStackCapacity, capacity: TUNE.emptyStackCapacity },
    };
    this.ibt = { count: 0, clearing: false, timer: 0 };
    this.sides = {
      primary: this.makeSide("primary", "Primary", TUNE.primarySpawnMs),
      secondary: this.makeSide("secondary", "Secondary", TUNE.secondarySpawnMs),
    };
    this.staging = {
      lanes: Array.from({ length: TUNE.stagingLanes }, (_, i) => ({
        index: i,
        label: String.fromCharCode(65 + i),
        pallets: [],
        colorKey: null,
        color: null,
        mixed: false,
        ready: false,
        reserved: false,
        jamClock: 0,
        x: 486 + i * 77,
        y: 430,
      })),
      gpmClock: 0,
    };
  }

  makeSide(key, label, spawnMs) {
    return {
      key,
      label,
      source: "ART",
      spawnMs,
      spawnClock: 0,
      artBacklog: TUNE.artCapacity,
      refillTimer: 0,
      raaBoxes: 0,
      raaPrep: 0,
      raaStarved: false,
      raaStackingLocked: false,
      inbound: [],
      completed: [],
      blockedClock: 0,
      starvationClock: 0,
      forecast: Array.from({ length: TUNE.forecastSize }, () => pickFreight()),
      bases: Array.from({ length: TUNE.baseCount }, (_, i) => ({
        index: i,
        colorKey: null,
        color: null,
        boxes: 0,
        empty: true,
        blocked: false,
        fullPallet: null,
      })),
    };
  }
}

class AlertManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  push(text, severity = "info") {
    this.items.unshift({ text, severity, age: 0 });
    this.items = this.items.slice(0, 5);
  }

  update(delta) {
    this.items.forEach((item) => item.age += delta);
    this.items = this.items.filter((item) => item.age < 11000);
  }
}

class ScoringManager {
  constructor(state, alerts) {
    this.state = state;
    this.alerts = alerts;
  }

  add(amount, reason) {
    this.state.score += amount;
    if (Math.abs(amount) >= 75) {
      this.alerts.push(`${amount > 0 ? "+" : ""}${amount} ${reason}`, amount > 0 ? "good" : "warn");
    }
  }
}

class ZoneManager {
  constructor(scene) {
    this.scene = scene;
    this.zones = ZONES;
    this.byAssignment = new Map(this.zones.map((zone) => [zone.assignment, zone]));
  }

  get(assignment) {
    return this.byAssignment.get(assignment);
  }

  drawStatic() {
    this.drawFloor();
    this.drawWarehouseDetails();
    this.zones.forEach((zone) => this.drawZone(zone));
  }

  drawFloor() {
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.floor, 1);
    g.fillRect(0, 78, W, H - 158);
    for (let x = 0; x < W; x += 128) {
      for (let y = 88; y < H - 82; y += 112) {
        g.fillStyle((x / 128 + y / 112) % 2 ? 0x5d625c : COLORS.floorDark, 0.42);
        g.fillRect(x, y, 126, 110);
      }
    }
    g.lineStyle(1, 0x303737, 0.28);
    for (let x = 0; x <= W; x += 128) g.lineBetween(x, 78, x, H - 80);
    for (let y = 88; y <= H - 80; y += 112) g.lineBetween(0, y, W, y);
    this.drawStripedBand(g, 360, 544, 560, 54);
    this.drawStripedBand(g, 0, 544, 324, 54);
    this.drawStripedBand(g, 956, 544, 324, 54);
  }

  drawWarehouseDetails() {
    const g = this.scene.add.graphics();
    g.fillStyle(0x8b8981, 1);
    g.fillRect(0, 78, W, 42);
    g.fillStyle(0x3e403e, 0.9);
    g.fillRect(0, 115, W, 7);
    this.drawStorageRack(g, 16, 122, 92, 220);
    this.drawStorageRack(g, 1172, 122, 92, 220);
    this.drawPalletStack(g, 76, 515, 3, 3);
    this.drawPalletStack(g, 1166, 515, 3, 3);
    this.drawForklift(g, 945, 590);
    this.drawPalletJack(g, 180, 594);
  }

  drawZone(zone) {
    const g = this.scene.add.graphics();
    g.fillStyle(zone.color, 0.08);
    g.fillRoundedRect(zone.x - zone.w / 2, zone.y - zone.h / 2, zone.w, zone.h, 8);
    g.lineStyle(3, zone.color, 0.45);
    g.strokeRoundedRect(zone.x - zone.w / 2, zone.y - zone.h / 2, zone.w, zone.h, 8);
    this.scene.add.text(zone.x - zone.w / 2 + 10, zone.y - zone.h / 2 + 8, zone.label, {
      fontFamily: "Arial Black, Arial",
      fontSize: 12,
      color: "#f8fafc",
    }).setDepth(4);
    const hit = this.scene.add.zone(zone.x, zone.y, zone.w, zone.h).setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => this.scene.handleZoneClick(zone.assignment));
  }

  drawStripedBand(g, x, y, w, h) {
    g.fillStyle(0xc59222, 0.11);
    g.fillRect(x, y, w, h);
    g.lineStyle(4, 0xc59222, 0.52);
    g.strokeRect(x, y, w, h);
    for (let sx = x - h; sx < x + w; sx += 24) {
      g.lineStyle(3, 0xc59222, 0.38);
      g.lineBetween(sx, y + h, sx + h, y);
    }
  }

  drawStorageRack(g, x, y, w, h) {
    g.fillStyle(0x10202a, 0.96);
    g.fillRoundedRect(x, y, w, h, 4);
    g.fillStyle(0x1d4ed8, 0.82);
    g.fillRect(x + 8, y, 6, h);
    g.fillRect(x + w - 14, y, 6, h);
    for (let row = 0; row < 3; row++) {
      const py = y + 28 + row * 62;
      g.fillStyle(0xc26b1a, 0.88);
      g.fillRect(x + 8, py, w - 16, 6);
      this.drawPalletStack(g, x + w / 2, py + 28, 2, 1, 22);
    }
  }

  drawDockPortal(g, x, y, label) {
    g.fillStyle(0x11181b, 1);
    g.fillRoundedRect(x - 62, y - 30, 124, 86, 4);
    g.fillStyle(0x050708, 1);
    g.fillRect(x - 34, y - 8, 68, 64);
    for (let yy = y; yy < y + 50; yy += 9) {
      g.lineStyle(2, 0x364347, 0.8);
      g.lineBetween(x - 28, yy, x + 28, yy);
    }
    g.fillStyle(0xe8e0d0, 1);
    g.fillRoundedRect(x - 15, y - 24, 30, 22, 2);
    this.scene.add.text(x, y - 13, label, {
      fontFamily: "Arial Black, Arial",
      fontSize: 15,
      color: "#111827",
    }).setOrigin(0.5);
  }

  drawPalletStack(g, x, y, cols, rows, size = 28) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const bx = x - (cols * size) / 2 + col * size + 2;
        const by = y - (rows * (size - 4)) / 2 + row * (size - 4);
        g.fillStyle(COLORS.brown, 0.95);
        g.fillRoundedRect(bx, by, size - 4, size - 8, 2);
        g.lineStyle(1, 0x5e3515, 0.7);
        g.strokeRoundedRect(bx, by, size - 4, size - 8, 2);
      }
    }
  }

  drawForklift(g, x, y) {
    g.fillStyle(0x05090c, 0.25);
    g.fillEllipse(x, y + 20, 130, 28);
    g.fillStyle(0xd6a21e, 0.95);
    g.fillRoundedRect(x - 30, y - 22, 72, 48, 7);
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(x - 48, y - 28, 42, 60, 5);
    g.fillCircle(x - 38, y + 28, 11);
    g.fillCircle(x + 34, y + 24, 10);
    g.lineStyle(5, 0x111827, 1);
    g.lineBetween(x - 66, y + 0, x - 122, y + 0);
    g.lineBetween(x - 66, y + 15, x - 122, y + 15);
  }

  drawPalletJack(g, x, y) {
    g.lineStyle(5, 0xd97706, 0.95);
    g.lineBetween(x, y, x + 58, y);
    g.lineBetween(x + 8, y + 14, x + 62, y + 14);
    g.lineStyle(4, 0x1f2937, 1);
    g.lineBetween(x + 58, y - 4, x + 78, y - 38);
    g.fillStyle(0x111827, 1);
    g.fillCircle(x + 3, y + 4, 6);
    g.fillCircle(x + 62, y + 17, 5);
  }
}

class WorkerManager {
  constructor(scene, state, zones, alerts) {
    this.scene = scene;
    this.state = state;
    this.zones = zones;
    this.alerts = alerts;
    this.selected = null;
    this.workers = [
      "Avery", "Blake", "Casey", "Drew", "Emery",
    ].map((name, i) => ({
      id: i + 1,
      name,
      efficiency: 0.85 + (i % 4) * 0.1,
      assignment: "idle",
      status: "Idle",
      x: 565 + i * 22,
      y: 642,
      tx: 565 + i * 22,
      ty: 642,
      sprite: null,
      visualRole: "worker",
      workerFrame: null,
      rosterBox: null,
      rosterText: null,
    }));
  }

  createSprites() {
    const hasSheet = this.scene.textures.exists(WORKER_SHEET.key);
    this.workers.forEach((worker, i) => {
      const frame = hasSheet ? (i % 4) * 7 + 5 : undefined;
      worker.workerFrame = frame;
      worker.sprite = this.scene.add.sprite(worker.x, worker.y, hasSheet ? WORKER_SHEET.key : "workerFallback", frame)
        .setScale(hasSheet ? WORKER_SHEET.scale : 1)
        .setDepth(25)
        .setInteractive({ useHandCursor: true });
      worker.sprite.on("pointerdown", () => this.select(worker));
    });
  }

  select(worker) {
    this.selected = worker;
    this.alerts.push(`${worker.name} selected. Click a zone to assign.`, "info");
  }

  assignSelected(assignment) {
    if (!this.selected) {
      this.alerts.push("Select a worker first, then click a zone.", "warn");
      return;
    }
    this.assign(this.selected, assignment);
  }

  assign(worker, assignment) {
    const zone = this.zones.get(assignment);
    if (!zone && assignment !== "idle") return;
    if (zone?.noWorkerAssignment || assignment === "ibt") {
      const message = assignment === "emptyTrailer"
        ? "Select the RC operator and click the empty trailer to restock both side stacks."
        : "This is a drop/supply zone, not a worker assignment.";
      this.alerts.push(message, "info");
      return;
    }
    if (assignment === "staging") {
      const currentRc = this.workers.find((item) => item !== worker && item.assignment === "staging");
      if (currentRc) {
        this.alerts.push(`${currentRc.name} is already assigned as the RC operator. Only one worker can run staging.`, "warn");
        return;
      }
    }
    worker.assignment = assignment;
    worker.status = ASSIGNMENT_LABELS[assignment] || "Working";
    const offset = ((worker.id % 5) - 2) * 12;
    worker.tx = zone ? zone.x + offset : 640 + offset;
    worker.ty = zone ? zone.y + 26 + ((worker.id % 2) * 18) : 642;
    this.alerts.push(`${worker.name} assigned: ${worker.status}.`, "info");
  }

  productivity(assignment) {
    return this.workers
      .filter((worker) => worker.assignment === assignment && !worker.job && this.isAtTarget(worker))
      .reduce((sum, worker) => sum + worker.efficiency, 0);
  }

  availableForJob(assignments) {
    return this.workers.find((worker) =>
      assignments.includes(worker.assignment) &&
      !worker.job &&
      this.isAtTarget(worker)
    );
  }

  utilization() {
    const active = this.workers.filter((worker) => worker.assignment !== "idle").length;
    return active / this.workers.length;
  }

  isAtTarget(worker) {
    return Phaser.Math.Distance.Between(worker.x, worker.y, worker.tx, worker.ty) < 10;
  }

  update(delta) {
    const dt = delta / 1000;
    this.workers.forEach((worker) => {
      const dx = worker.tx - worker.x;
      const dy = worker.ty - worker.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 2) {
        const speed = worker.assignment === "staging" ? TUNE.rcWorkerSpeed : TUNE.workerSpeed;
        const step = Math.min(dist, speed * dt);
        worker.x += (dx / dist) * step;
        worker.y += (dy / dist) * step;
        worker.status = worker.job ? worker.job.status : `Moving: ${ASSIGNMENT_LABELS[worker.assignment] || "Zone"}`;
      } else {
        worker.status = worker.job ? worker.job.status : ASSIGNMENT_LABELS[worker.assignment] || "Idle";
      }
      if (worker.sprite) {
        this.updateWorkerVisual(worker);
        worker.sprite.x = worker.x;
        worker.sprite.y = worker.y + Math.sin(this.scene.now / 180 + worker.id) * 2;
        worker.sprite.setTint(this.selected === worker ? 0xfef08a : 0xffffff);
      }
    });
  }

  updateWorkerVisual(worker) {
    const shouldUseRc = worker.assignment === "staging" && this.scene.textures.exists(RC_SHEET.key);
    const nextRole = shouldUseRc ? "rc" : "worker";
    if (worker.visualRole === nextRole) {
      if (nextRole === "rc") {
        worker.sprite.setFrame(this.getRcFrame(worker));
      }
      return;
    }
    worker.visualRole = nextRole;
    if (shouldUseRc) {
      worker.sprite.setTexture(RC_SHEET.key, this.getRcFrame(worker));
      worker.sprite.setScale(RC_SHEET.scale);
      return;
    }
    const hasSheet = this.scene.textures.exists(WORKER_SHEET.key);
    worker.sprite.setTexture(hasSheet ? WORKER_SHEET.key : "workerFallback", hasSheet ? worker.workerFrame : undefined);
    worker.sprite.setScale(hasSheet ? WORKER_SHEET.scale : 1);
  }

  getRcFrame(worker) {
    if (worker.job?.type === "ibt" || worker.job?.type === "staging") return 5 + (worker.id % 3);
    if (worker.job?.system === "rcRestock") return 3;
    if (worker.job?.system === "rcRaaPrep") return 4;
    return worker.job ? 4 : 0;
  }
}

class FlowManager {
  constructor(state, workers, scoring, alerts) {
    this.state = state;
    this.workers = workers;
    this.scoring = scoring;
    this.alerts = alerts;
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
        side.artBacklog = TUNE.artCapacity;
        side.raaStarved = false;
        side.raaStackingLocked = false;
        this.alerts.push(`${side.label} ART trailer docked.`, "good");
      }
    }

    while (side.spawnClock >= side.spawnMs && this.sourceReady(side)) {
      side.spawnClock -= side.spawnMs;
      this.generateFreight(side);
    }
    if (!this.hasSourceAvailable(side)) side.spawnClock = Math.min(side.spawnClock, side.spawnMs);

    const labor = this.workers.productivity(side.key) + this.workers.productivity("floater") * 0.45;
    const capacity = labor * delta * 0.006;
    side.processBank = (side.processBank || 0) + capacity;
    while (side.processBank >= 1 && side.inbound.length > 0) {
      if (!this.processOneBox(side)) break;
      side.processBank -= 1;
    }

    if (side.inbound.length > 12 || side.bases.some((base) => base.blocked)) {
      side.blockedClock += delta;
      if (side.blockedClock > 3500) {
        side.blockedClock = 0;
        this.state.stats.blockedTicks += 1;
        this.scoring.add(TUNE.scores.blockedTick, `${side.label} bottleneck`);
      }
    } else {
      side.blockedClock = Math.max(0, side.blockedClock - delta);
    }
  }

  sourceReady(side) {
    if (side.source === "ART") {
      if (side.artBacklog > 0 && side.refillTimer <= 0) return true;
      side.starvationClock += 16;
      if (!side.raaStackingLocked && side.raaPrep <= 0 && side.raaBoxes <= 0) {
        side.raaStackingLocked = true;
      }
      return false;
    }
    if (side.raaBoxes > 0) return true;
    if (side.raaPrep > 0) {
      side.raaPrep -= 1;
      side.raaBoxes = TUNE.raaPalletBoxes;
      side.raaStarved = false;
      return true;
    }
    if (!side.raaStarved) {
      side.raaStarved = true;
      this.state.stats.missedRaa += 1;
      this.scoring.add(TUNE.scores.starvation, `${side.label} RAA not ready`);
      this.alerts.push(`${side.label} RAA is dry. Send the RC to prep backup freight.`, "warn");
    }
    return false;
  }

  hasSourceAvailable(side) {
    if (side.source === "ART") return side.artBacklog > 0 && side.refillTimer <= 0;
    return side.raaBoxes > 0 || side.raaPrep > 0;
  }

  generateFreight(side) {
    if (side.source === "ART") {
      side.artBacklog -= 1;
      if (side.artBacklog === 0) {
        if (side.raaPrep <= 0 && side.raaBoxes <= 0) side.raaStackingLocked = true;
        this.alerts.push(`${side.label} ART empty. Toggle to RAA or request trailer.`, "warn");
      }
    } else {
      side.raaBoxes -= 1;
    }
    const freight = side.forecast.shift();
    side.forecast.push(pickFreight());
    side.inbound.push(freight);
  }

  processOneBox(side) {
    const freight = side.inbound[0];
    const base = this.findBase(side, freight);
    if (!base) return false;
    side.inbound.shift();
    base.colorKey = freight.key;
    base.color = freight.color;
    base.boxes += 1;
    if (base.boxes >= TUNE.baseCapacity) {
      base.fullPallet = { colorKey: base.colorKey, color: base.color, side: side.key };
      base.blocked = true;
    }
    return true;
  }

  findBase(side, freight) {
    const same = side.bases.find((base) =>
      base.empty && !base.blocked && base.colorKey === freight.key && base.boxes < TUNE.baseCapacity
    );
    if (same) return same;
    return side.bases.find((base) =>
      base.empty && !base.blocked && base.boxes === 0 && base.colorKey === null
    );
  }

  updateEmptyPalletJobs() {
    this.workers.workers.forEach((worker) => {
      const job = worker.job;
      if (job?.system !== "emptyPallet" || !this.workers.isAtTarget(worker)) return;
      if (job.phase === "pickup") {
        const stack = this.state.emptyStacks[job.sideKey];
        if (stack.count <= 0) {
          worker.job = null;
          const home = this.getZoneHome(worker.assignment);
          worker.tx = home.x;
          worker.ty = home.y;
          this.alerts.push(`${job.sideLabel} empty stack is out. Restock with RC.`, "warn");
          return;
        }
        stack.count -= 1;
        job.phase = "dropoff";
        job.status = `Carrying empty to ${job.sideLabel} base`;
        worker.tx = job.dropX;
        worker.ty = job.dropY;
        return;
      }
      if (job.phase === "dropoff") {
        job.base.empty = true;
        job.base.blocked = false;
        job.base.fullPallet = null;
        worker.job = null;
        const home = this.getZoneHome(worker.assignment);
        worker.tx = home.x;
        worker.ty = home.y;
        this.scoring.add(TUNE.scores.emptyPallet, "empty pallet set");
      }
    });
  }

  dispatchEmptyPalletJobs() {
    Object.values(this.state.sides).forEach((side) => {
      if (this.state.emptyStacks[side.key].count <= 0) return;
      side.bases.forEach((base) => {
        if (base.empty || !base.blocked || base.fullPallet || this.baseHasEmptyJob(base)) return;
        const worker = this.workers.availableForJob([side.key]);
        if (!worker) return;
        const pickup = this.getStackPosition(side.key);
        const drop = this.getBasePosition(side, base);
        worker.job = {
          system: "emptyPallet",
          phase: "pickup",
          sideKey: side.key,
          sideLabel: side.label,
          base,
          pickupX: pickup.x,
          pickupY: pickup.y,
          dropX: drop.x,
          dropY: drop.y,
          status: `Walking to ${side.label} empty stack`,
        };
        worker.tx = pickup.x;
        worker.ty = pickup.y;
      });
    });
  }

  baseHasEmptyJob(base) {
    return this.workers.workers.some((worker) => worker.job?.system === "emptyPallet" && worker.job.base === base);
  }

  getStackPosition(sideKey) {
    const zone = ZONES.find((item) => item.assignment === `${sideKey}Stack`);
    return { x: zone.x, y: zone.y };
  }

  getZoneHome(assignment) {
    const zone = ZONES.find((item) => item.assignment === assignment) || ZONES.find((item) => item.assignment === "floater");
    return { x: zone.x, y: zone.y + 24 };
  }

  getBasePosition(side, base) {
    const zone = ZONES.find((item) => item.assignment === side.key);
    return {
      x: zone.x - 68 + (base.index % 2) * 136,
      y: zone.y - 54 + Math.floor(base.index / 2) * 58,
    };
  }

  updateFlowHealth(delta) {
    const p = this.state.sides.primary;
    const s = this.state.sides.secondary;
    const inbound = p.inbound.length + s.inbound.length;
    const completed = this.waitingFullPallets(p) + this.waitingFullPallets(s);
    const blocked = [...p.bases, ...s.bases].filter((base) => base.blocked).length;
    const missing = [...p.bases, ...s.bases].filter((base) => !base.empty && base.blocked && !base.fullPallet).length;
    const mixed = this.state.staging.lanes.filter((lane) => lane.mixed).length;
    const ibtPressure = this.state.ibt.count >= TUNE.ibtCapacity ? 18 : this.state.ibt.count >= 8 ? 8 : 0;
    const sourcePressure = (p.source === "ART" && p.artBacklog <= 0 ? 12 : 0) + (s.source === "ART" && s.artBacklog <= 0 ? 12 : 0);
    const idlePenalty = (1 - this.workers.utilization()) * 8;
    const pressure = inbound * 1.25 + completed * 2.2 + blocked * 8 + missing * 5 + mixed * 7 + ibtPressure + sourcePressure + idlePenalty;
    const target = clamp(100 - pressure, 0, 100);
    this.state.flowHealth += (target - this.state.flowHealth) * Math.min(1, delta / 1200);
    this.state.flowSamples.push(this.state.flowHealth);
    if (this.state.flowSamples.length > 900) this.state.flowSamples.shift();
  }

  waitingFullPallets(side) {
    return side.bases.filter((base) => base.fullPallet).length;
  }

  toggleSource(sideKey) {
    const side = this.state.sides[sideKey];
    side.source = side.source === "ART" ? "RAA" : "ART";
    if (side.source === "RAA" && side.raaPrep > 0 && side.raaBoxes <= 0) {
      side.raaPrep -= 1;
      side.raaBoxes = TUNE.raaPalletBoxes;
      if (side.artBacklog <= 0) {
        this.state.stats.smoothRaa += 1;
        this.scoring.add(TUNE.scores.smoothRaa, `${side.label} smooth RAA`);
      }
    }
    this.alerts.push(`${side.label} source toggled to ${side.source}.`, "info");
  }

  requestTrailer(sideKey) {
    const side = this.state.sides[sideKey];
    if (side.artBacklog > 0 || side.refillTimer > 0) {
      this.alerts.push(`${side.label} trailer request unavailable.`, "warn");
      return;
    }
    side.refillTimer = TUNE.artRefillMs;
    this.scoring.add(TUNE.scores.trailerRequest, `${side.label} trailer request`);
    this.alerts.push(`${side.label} trailer requested. Dock turn started.`, "good");
  }
}

class StagingManager {
  constructor(state, workers, scoring, alerts) {
    this.state = state;
    this.workers = workers;
    this.scoring = scoring;
    this.alerts = alerts;
  }

  update(delta) {
    this.updateTransportJobs(delta);
    this.dispatchTransportJobs();
    this.updateGpm(delta);
    this.updateIbt(delta);
  }

  updateTransportJobs(delta) {
    this.workers.workers.forEach((worker) => {
      const job = worker.job;
      if (!job || !["transport", "rcRestock", "rcRaaPrep"].includes(job.system)) return;
      if (job.system === "rcRaaPrep" && job.phase === "prep") {
        job.timer = Math.max(0, job.timer - delta);
        if (job.timer > 0) return;
        const side = this.state.sides[job.sideKey];
        const maxPrep = side.raaStackingLocked ? 1 : TUNE.raaPrepCapacity;
        if (side.raaPrep < maxPrep) {
          side.raaPrep += 1;
          this.scoring.add(TUNE.scores.raaPrep, `${side.label} RAA prep`);
          this.alerts.push(`${side.label} RAA pallet prepped: 10 boxes.`, "good");
        }
        job.phase = "return";
        job.status = "RC returning from RAA prep";
        worker.tx = job.dropX;
        worker.ty = job.dropY;
        return;
      }
      if (!this.workers.isAtTarget(worker)) return;
      if (job.system === "rcRestock") {
        if (job.phase === "pickup") {
          this.state.emptyStacks.primary.count = TUNE.emptyStackCapacity;
          this.state.emptyStacks.secondary.count = TUNE.emptyStackCapacity;
          this.state.stats.emptyRestocks += 1;
          job.phase = "return";
          job.status = "RC returning from empty trailer";
          worker.tx = job.dropX;
          worker.ty = job.dropY;
          this.alerts.push("RC restocked both empty pallet stacks.", "good");
          return;
        }
        worker.job = null;
        const home = this.getWorkerHome(worker.assignment);
        worker.tx = home.x;
        worker.ty = home.y;
        return;
      }
      if (job.system === "rcRaaPrep") {
        if (job.phase === "travel") {
          job.phase = "prep";
          job.timer = TUNE.raaPrepMs;
          job.status = "RC prepping RAA pallet";
          return;
        }
        worker.job = null;
        const home = this.getWorkerHome(worker.assignment);
        worker.tx = home.x;
        worker.ty = home.y;
        return;
      }
      if (job.phase === "pickup") {
        job.phase = "dropoff";
        job.status = job.type === "ibt" ? "RC hauling blue to IBT" : "RC hauling pallet to staging";
        job.base.fullPallet = null;
        job.base.colorKey = null;
        job.base.color = null;
        job.base.boxes = 0;
        job.base.empty = false;
        job.base.blocked = true;
        worker.tx = job.dropX;
        worker.ty = job.dropY;
        return;
      }
      if (job.phase === "dropoff") {
        if (job.type === "ibt") {
          if (this.state.ibt.count >= TUNE.ibtCapacity) {
            this.state.stats.ibtOverflow += 1;
            this.scoring.add(TUNE.scores.ibtOverflow, "IBT overflow");
          } else {
            this.state.ibt.count += 1;
            this.scoring.add(TUNE.scores.ibtStage, "blue to IBT");
          }
        } else {
          job.lane.reserved = false;
          this.addToLane(job.lane, job.pallet);
        }
        worker.job = null;
        const home = this.getWorkerHome(worker.assignment);
        worker.tx = home.x;
        worker.ty = home.y;
      }
    });
  }

  dispatchTransportJobs() {
    Object.values(this.state.sides).forEach((side) => {
      side.bases.forEach((base) => {
        if (!base.fullPallet || this.baseHasActiveJob(base)) return;
        const pallet = base.fullPallet;
        const pickup = this.getBasePosition(side, base);
        if (pallet.colorKey === "Blue") {
          const worker = this.workers.availableForJob(["staging"]);
          if (!worker || this.state.ibt.count >= TUNE.ibtCapacity) return;
          this.assignTransportJob(worker, {
            type: "ibt",
            sideKey: side.key,
            base,
            pallet,
            pickupX: pickup.x,
            pickupY: pickup.y,
            dropX: 910,
            dropY: 606,
            status: "RC to blue pallet",
          });
          return;
        }
        const lane = this.findLane(pallet);
        const worker = this.workers.availableForJob(["staging"]);
        if (!lane || !worker) return;
        this.assignTransportJob(worker, {
          type: "staging",
          sideKey: side.key,
          base,
          lane,
          pallet,
          pickupX: pickup.x,
          pickupY: pickup.y,
          dropX: lane.x,
          dropY: lane.y,
          status: "RC to full pallet",
        });
      });
    });
  }

  assignTransportJob(worker, job) {
    job.system = "transport";
    job.phase = "pickup";
    if (job.lane) job.lane.reserved = true;
    worker.job = job;
    worker.status = job.status;
    worker.tx = job.pickupX;
    worker.ty = job.pickupY;
  }

  requestEmptyPalletRestock() {
    const worker = this.workers.selected;
    if (!worker || worker.assignment !== "staging") {
      this.alerts.push("Select the RC operator assigned to staging, then click the empty trailer.", "warn");
      return;
    }
    if (worker.job) {
      this.alerts.push("RC operator is already committed to a trip.", "warn");
      return;
    }
    const trailer = ZONES.find((item) => item.assignment === "emptyTrailer");
    const home = this.getWorkerHome("staging");
    worker.job = {
      system: "rcRestock",
      phase: "pickup",
      status: "RC to empty pallet trailer",
      pickupX: trailer.x,
      pickupY: trailer.y,
      dropX: home.x,
      dropY: home.y,
    };
    worker.tx = trailer.x;
    worker.ty = trailer.y;
    this.alerts.push("RC dispatched to restock empty pallet stacks.", "info");
  }

  requestRaaPrep(sideKey) {
    const worker = this.workers.selected;
    const side = this.state.sides[sideKey];
    const maxPrep = side.raaStackingLocked ? 1 : TUNE.raaPrepCapacity;
    if (!worker || worker.assignment !== "staging") {
      this.alerts.push("Select the RC operator assigned to staging, then click an RAA prep zone.", "warn");
      return;
    }
    if (worker.job) {
      this.alerts.push("RC operator is already committed to a trip.", "warn");
      return;
    }
    if (side.raaPrep >= maxPrep) {
      const reason = side.raaStackingLocked ? "stacking was lost after ART ran dry" : "prep buffer is full";
      this.alerts.push(`${side.label} RAA unavailable: ${reason}.`, "warn");
      return;
    }
    const zone = ZONES.find((item) => item.assignment === `raa${sideKey[0].toUpperCase()}${sideKey.slice(1)}`);
    const home = this.getWorkerHome("staging");
    worker.job = {
      system: "rcRaaPrep",
      phase: "travel",
      sideKey,
      status: `RC to ${side.label} RAA prep`,
      pickupX: zone.x,
      pickupY: zone.y,
      dropX: home.x,
      dropY: home.y,
    };
    worker.tx = zone.x;
    worker.ty = zone.y;
    this.alerts.push(`RC dispatched to ${side.label} RAA prep.`, "info");
  }

  baseHasActiveJob(base) {
    return this.workers.workers.some((worker) => worker.job?.base === base);
  }

  getWorkerHome(assignment) {
    const zone = ZONES.find((item) => item.assignment === assignment) || ZONES.find((item) => item.assignment === "floater");
    return { x: zone.x, y: zone.y + 24 };
  }

  getBasePosition(side, base) {
    const zone = ZONES.find((item) => item.assignment === side.key);
    return {
      x: zone.x - 68 + (base.index % 2) * 136,
      y: zone.y - 54 + Math.floor(base.index / 2) * 58,
    };
  }

  findLane(pallet) {
    return this.state.staging.lanes.find((lane) =>
      !lane.reserved && !lane.mixed && !lane.ready && lane.colorKey === pallet.colorKey && lane.pallets.length < TUNE.stagingCapacity
    ) || this.state.staging.lanes.find((lane) =>
      !lane.reserved && lane.pallets.length === 0
    ) || this.state.staging.lanes.find((lane) =>
      !lane.reserved && !lane.ready && lane.pallets.length > 0 && lane.pallets.length < TUNE.stagingCapacity
    );
  }

  addToLane(lane, pallet) {
    if (lane.pallets.length === 0) {
      lane.colorKey = pallet.colorKey;
      lane.color = pallet.color;
    }
    if (lane.colorKey !== pallet.colorKey) {
      lane.mixed = true;
      lane.ready = false;
      lane.jamClock = 0;
      this.state.stats.mixedMistakes += 1;
      this.scoring.add(TUNE.scores.mixedLane, "mixed staging");
      this.alerts.push(`Lane ${lane.label} mixed. Rework or GPM needed.`, "warn");
    }
    lane.pallets.push(pallet);
    if (lane.pallets.length >= TUNE.stagingCapacity && !lane.mixed) {
      lane.ready = true;
      const hot = this.isHotColor(lane.colorKey);
      this.scoring.add(TUNE.scores.cleanStage + (hot ? TUNE.scores.hotStage : 0), hot ? "hot clean staging" : "clean staging");
      this.state.stats.cleanPallets += lane.pallets.length;
    }
  }

  isHotColor(colorKey) {
    return Object.values(this.state.sides).some((side) => {
      const counts = new Map();
      side.forecast.slice(0, 5).forEach((freight) => {
        if (freight.key !== "Blue") counts.set(freight.key, (counts.get(freight.key) || 0) + 1);
      });
      return (counts.get(colorKey) || 0) >= 2;
    });
  }

  updateGpm(delta) {
    this.state.staging.gpmClock += delta;
    if (this.state.staging.gpmClock < TUNE.gpmMs) return;
    this.state.staging.gpmClock = 0;
    this.state.staging.lanes.forEach((lane) => {
      if (lane.ready && !lane.mixed && Math.random() < TUNE.gpmChance) {
        const cleared = lane.pallets.length;
        this.resetLane(lane);
        this.scoring.add(cleared * TUNE.scores.gpmClear, "GPM pickup");
      }
      if (lane.mixed) {
        lane.jamClock += TUNE.gpmMs;
        if (lane.jamClock >= 11000) {
          lane.jamClock = 0;
          this.scoring.add(-20, "mixed lane jam");
        }
      }
    });
  }

  updateIbt(delta) {
    const ibt = this.state.ibt;
    if (!ibt.clearing) return;
    ibt.timer = Math.max(0, ibt.timer - delta);
    if (ibt.timer === 0) {
      this.alerts.push(`IBT cleared ${ibt.count} blue pallets.`, "good");
      ibt.count = 0;
      ibt.clearing = false;
    }
  }

  requestIbt() {
    const ibt = this.state.ibt;
    if (ibt.clearing) {
      this.alerts.push("IBT clear already in progress.", "warn");
      return;
    }
    if (ibt.count <= 0) {
      this.alerts.push("IBT has no blue pallets to clear.", "warn");
      return;
    }
    ibt.clearing = true;
    ibt.timer = TUNE.ibtClearMs;
    this.alerts.push("IBT clear requested.", "good");
  }

  manualGpm() {
    const staged = this.state.staging.lanes.reduce((sum, lane) => sum + lane.pallets.length, 0);
    this.state.staging.lanes.forEach((lane) => this.resetLane(lane));
    this.state.stats.manualGpm += 1;
    this.scoring.add(TUNE.scores.manualGpm, "manual GPM");
    this.alerts.push(`Manual GPM cleared ${staged} staged pallets.`, "warn");
  }

  reworkMixedLane() {
    const lane = this.state.staging.lanes.find((item) => item.mixed);
    if (!lane) {
      this.alerts.push("No mixed lane needs rework.", "info");
      return;
    }
    const groups = [];
    lane.pallets.forEach((pallet) => {
      let group = groups.find((item) => item.colorKey === pallet.colorKey);
      if (!group) {
        group = { colorKey: pallet.colorKey, color: pallet.color, pallets: [] };
        groups.push(group);
      }
      group.pallets.push(pallet);
    });
    const open = this.state.staging.lanes.filter((item) => item !== lane && !item.reserved && item.pallets.length === 0);
    if (open.length < groups.length - 1) {
      this.alerts.push("Rework needs more open staging lanes.", "warn");
      return;
    }
    this.resetLane(lane);
    groups.forEach((group, index) => {
      const target = index === 0 ? lane : open[index - 1];
      target.colorKey = group.colorKey;
      target.color = group.color;
      target.pallets = group.pallets;
      target.ready = target.pallets.length >= TUNE.stagingCapacity;
    });
    this.state.stats.reworks += 1;
    this.scoring.add(TUNE.scores.rework, "staging rework");
    this.alerts.push("Mixed lane reworked into clean freight groups.", "good");
  }

  resetLane(lane) {
    lane.pallets = [];
    lane.colorKey = null;
    lane.color = null;
    lane.mixed = false;
    lane.ready = false;
    lane.reserved = false;
    lane.jamClock = 0;
  }
}

class UIManager {
  constructor(scene, state, workers, zones, alerts) {
    this.scene = scene;
    this.state = state;
    this.workers = workers;
    this.zones = zones;
    this.alerts = alerts;
    this.dynamic = scene.add.graphics().setDepth(30);
    this.texts = [];
    this.buttons = [];
  }

  createStatic() {
    this.drawPanels();
    this.createButtons();
    this.createRoster();
  }

  drawPanels() {
    const g = this.scene.add.graphics();
    g.fillStyle(0x071016, 0.98);
    g.fillRect(0, 0, W, 78);
    g.fillRect(0, 78, 178, H - 78);
    g.fillRect(1102, 78, 178, H - 78);
    g.fillRect(0, 650, W, 70);
    g.lineStyle(2, 0x38bdf8, 0.25);
    g.lineBetween(0, 78, W, 78);
    g.lineBetween(178, 78, 178, H);
    g.lineBetween(1102, 78, 1102, H);
    g.lineBetween(0, 650, W, 650);
    this.scene.add.text(18, 14, "WAREHOUSE FLOW COMMANDER", {
      fontFamily: "Arial Black, Arial",
      fontSize: 23,
      color: "#f8fafc",
    });
    this.scene.add.text(20, 46, "RTS operations training - assign labor before freight flow collapses", {
      fontSize: 12,
      color: "#91a7b1",
    });
    this.scene.add.text(16, 94, "TEAM", { fontFamily: "Arial Black, Arial", fontSize: 13, color: "#bae6fd" });
    this.scene.add.text(1120, 94, "OPERATIONS", { fontFamily: "Arial Black, Arial", fontSize: 13, color: "#fde68a" });
  }

  createRoster() {
    this.workers.workers.forEach((worker, i) => {
      const y = 120 + i * 58;
      const box = this.scene.add.rectangle(88, y, 152, 46, 0x12202a, 0.94)
        .setStrokeStyle(1, 0x3f5663, 0.7)
        .setInteractive({ useHandCursor: true });
      const text = this.scene.add.text(22, y - 16, "", { fontSize: 11, color: "#dbeafe" });
      box.on("pointerdown", () => this.workers.select(worker));
      worker.rosterBox = box;
      worker.rosterText = text;
    });
  }

  createButtons() {
    const buttons = [
      [218, 684, 126, "Toggle P", () => this.scene.flow.toggleSource("primary")],
      [350, 684, 126, "Toggle S", () => this.scene.flow.toggleSource("secondary")],
      [500, 684, 144, "Request P ART", () => this.scene.flow.requestTrailer("primary")],
      [652, 684, 144, "Request S ART", () => this.scene.flow.requestTrailer("secondary")],
      [802, 684, 130, "Clear IBT", () => this.scene.staging.requestIbt()],
      [934, 684, 122, "Rework", () => this.scene.staging.reworkMixedLane()],
      [1062, 684, 124, "Call GPM", () => this.scene.staging.manualGpm()],
    ];
    buttons.forEach(([x, y, w, label, cb]) => this.makeButton(x, y, w, 36, label, cb));
  }

  makeButton(x, y, w, h, label, cb) {
    const rect = this.scene.add.rectangle(x, y, w, h, 0x182833, 0.96)
      .setStrokeStyle(1, 0x4e6a78, 0.9)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add.text(x, y, label, {
      fontFamily: "Arial Black, Arial",
      fontSize: 11,
      color: "#f8fafc",
    }).setOrigin(0.5);
    rect.on("pointerover", () => rect.setFillStyle(0x243946, 1));
    rect.on("pointerout", () => rect.setFillStyle(0x182833, 0.96));
    rect.on("pointerdown", cb);
    this.buttons.push({ rect, text });
  }

  update() {
    this.clearTexts();
    this.dynamic.clear();
    this.drawTopHud();
    this.drawRightPanel();
    this.drawRoster();
    this.drawMapReadouts();
    this.drawAlerts();
    if (this.state.gameOver) this.drawEndScreen();
  }

  clearTexts() {
    this.texts.forEach((text) => text.destroy());
    this.texts = [];
  }

  addText(x, y, text, style = {}, origin = 0) {
    const t = this.scene.add.text(x, y, text, {
      fontSize: 11,
      color: "#dbeafe",
      ...style,
    }).setDepth(35).setOrigin(origin);
    this.texts.push(t);
    return t;
  }

  drawTopHud() {
    const g = this.dynamic;
    const health = Math.round(this.state.flowHealth);
    const color = health >= TUNE.flowWarning ? COLORS.green : health >= TUNE.flowCritical ? COLORS.yellow : COLORS.red;
    this.addText(600, 16, `SCORE ${this.state.score}`, { fontFamily: "Arial Black, Arial", fontSize: 19, color: "#f8fafc" });
    this.addText(760, 16, `FLOW ${health}%`, { fontFamily: "Arial Black, Arial", fontSize: 19, color: health >= 70 ? "#bbf7d0" : health >= 40 ? "#fef08a" : "#fecaca" });
    this.addText(900, 16, `SHIFT ${formatTime(this.state.shiftRemaining)}`, { fontFamily: "Arial Black, Arial", fontSize: 19, color: "#dbeafe" });
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(600, 48, 342, 12, 6);
    g.fillStyle(color, 0.95);
    g.fillRoundedRect(600, 48, 342 * (health / 100), 12, 6);
  }

  drawRightPanel() {
    this.drawDockCard("primary", 1120, 124);
    this.drawDockCard("secondary", 1120, 306);
    this.drawCommandIntel(1120, 500);
  }

  drawDockCard(key, x, y) {
    const g = this.dynamic;
    const side = this.state.sides[key];
    const health = this.sideHealth(side);
    const healthColor = health >= 75 ? "#bbf7d0" : health >= 45 ? "#fef08a" : "#fecaca";
    const barColor = health >= 75 ? COLORS.green : health >= 45 ? COLORS.yellow : COLORS.red;
    const raaMax = side.raaStackingLocked ? 1 : TUNE.raaPrepCapacity;
    const fullWaiting = side.bases.filter((base) => base.fullPallet).length;
    const needsPallet = side.bases.filter((base) => !base.empty && base.blocked && !base.fullPallet).length;
    const sourceState = side.refillTimer > 0 ? "REFILL" : side.source;
    const sourceColor = sourceState === "REFILL" ? "#fef08a" : sourceState === "RAA" ? "#fde68a" : "#bae6fd";

    g.fillStyle(0x071016, 0.82);
    g.fillRoundedRect(x - 10, y - 12, 156, 158, 8);
    g.lineStyle(1, 0x2e4755, 0.78);
    g.strokeRoundedRect(x - 10, y - 12, 156, 158, 8);

    this.addText(x, y, `${side.label.toUpperCase()} DOCK`, { fontFamily: "Arial Black, Arial", fontSize: 13, color: "#f8fafc" });
    this.addText(x, y + 20, `${sourceState}`, { fontFamily: "Arial Black, Arial", fontSize: 12, color: sourceColor });
    this.addText(x + 78, y + 20, `FLOW ${health}%`, { fontFamily: "Arial Black, Arial", fontSize: 12, color: healthColor });

    this.drawMeter(x, y + 46, 128, side.artBacklog / TUNE.artCapacity, COLORS.cyan, `ART ${side.artBacklog}/100`);
    const raaLabel = side.raaStackingLocked ? `RAA ${side.raaPrep}/${raaMax} LOCKED` : `RAA ${side.raaPrep}/${raaMax}`;
    this.drawPips(x, y + 76, raaMax, side.raaPrep, side.raaStackingLocked ? COLORS.red : COLORS.yellow, raaLabel);
    this.addText(x, y + 102, `Inbound ${side.inbound.length}   Full ${fullWaiting}   Empty ${needsPallet}`, { fontSize: 10, color: "#cbd5e1" });
    if (side.refillTimer > 0) {
      this.addText(x, y + 120, `Trailer turn: ${formatTime(side.refillTimer)}`, { fontSize: 10, color: "#fef08a" });
    } else {
      this.addText(x, y + 120, this.recommendation(side), { fontSize: 10, color: "#fde68a", wordWrap: { width: 132 } });
    }
  }

  drawCommandIntel(x, y) {
    const g = this.dynamic;
    const rc = this.workers.workers.find((worker) => worker.assignment === "staging");
    const rcStatus = rc ? rc.status : "No RC assigned";
    const fullWaiting = Object.values(this.state.sides).reduce((sum, side) => sum + side.bases.filter((base) => base.fullPallet).length, 0);
    const blueWaiting = Object.values(this.state.sides).reduce((sum, side) => sum + side.bases.filter((base) => base.fullPallet?.colorKey === "Blue").length, 0);
    const lowStacks = Object.entries(this.state.emptyStacks).filter(([, stack]) => stack.count <= 2).map(([key]) => key[0].toUpperCase()).join("/");
    const utilization = Math.round(this.workers.utilization() * 100);

    g.fillStyle(0x071016, 0.82);
    g.fillRoundedRect(x - 10, y - 12, 156, 138, 8);
    g.lineStyle(1, 0x2e4755, 0.78);
    g.strokeRoundedRect(x - 10, y - 12, 156, 138, 8);

    this.addText(x, y, "COMMAND INTEL", { fontFamily: "Arial Black, Arial", fontSize: 13, color: "#fde68a" });
    this.addText(x, y + 24, `RC: ${rcStatus}`, { fontSize: 10, color: rc ? "#dbeafe" : "#fecaca", wordWrap: { width: 130 } });
    this.addText(x, y + 48, `Full pallets: ${fullWaiting}`, { fontSize: 10, color: fullWaiting ? "#fde68a" : "#bbf7d0" });
    this.addText(x, y + 66, `Blue pressure: ${blueWaiting}  IBT ${this.state.ibt.count}/${TUNE.ibtCapacity}`, { fontSize: 10, color: blueWaiting || this.state.ibt.count >= 8 ? "#bae6fd" : "#cbd5e1" });
    if (this.state.ibt.clearing) this.addText(x, y + 84, `IBT clear: ${formatTime(this.state.ibt.timer)}`, { fontSize: 10, color: "#fef08a" });
    else this.addText(x, y + 84, `Stacks: P ${this.state.emptyStacks.primary.count}/7  S ${this.state.emptyStacks.secondary.count}/7`, { fontSize: 10, color: lowStacks ? "#fde68a" : "#bbf7d0" });
    this.addText(x, y + 106, `Utilization: ${utilization}%`, { fontSize: 10, color: utilization >= 80 ? "#bbf7d0" : "#fef08a" });
  }

  drawMeter(x, y, w, ratio, color, label) {
    const g = this.dynamic;
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(x, y, w, 12, 6);
    g.fillStyle(color, 0.92);
    g.fillRoundedRect(x, y, w * clamp(ratio, 0, 1), 12, 6);
    this.addText(x, y - 15, label, { fontSize: 10, color: "#cbd5e1" });
  }

  drawPips(x, y, max, filled, color, label) {
    const g = this.dynamic;
    this.addText(x, y - 15, label, { fontSize: 10, color: "#cbd5e1" });
    for (let i = 0; i < max; i++) {
      g.fillStyle(i < filled ? color : 0x1f2937, i < filled ? 0.95 : 1);
      g.fillRoundedRect(x + i * 16, y, 11, 11, 2);
      g.lineStyle(1, 0x4b5d66, 0.75);
      g.strokeRoundedRect(x + i * 16, y, 11, 11, 2);
    }
  }

  sideHealth(side) {
    const inbound = side.inbound.length;
    const full = side.bases.filter((base) => base.fullPallet).length;
    const emptyNeeds = side.bases.filter((base) => !base.empty && base.blocked && !base.fullPallet).length;
    const artRisk = side.source === "ART" && side.artBacklog <= 12 ? 18 : side.source === "ART" && side.artBacklog <= 25 ? 8 : 0;
    const raaRisk = side.artBacklog <= 20 && side.raaPrep <= 0 ? 16 : 0;
    const sourceRisk = side.source === "ART" && side.artBacklog <= 0 ? 24 : 0;
    return Math.round(clamp(100 - inbound * 3 - full * 12 - emptyNeeds * 8 - artRisk - raaRisk - sourceRisk, 0, 100));
  }

  recommendation(side) {
    const full = side.bases.filter((base) => base.fullPallet).length;
    const emptyNeeds = side.bases.filter((base) => !base.empty && base.blocked && !base.fullPallet).length;
    if (side.source === "ART" && side.artBacklog <= 0 && side.raaPrep > 0) return "Switch to RAA now.";
    if (side.source === "ART" && side.artBacklog <= 0) return "Request trailer or prep RAA.";
    if (side.source === "ART" && side.artBacklog <= 20 && side.raaPrep <= 0) return "Send RC to prep RAA.";
    if (full >= 2) return "RC pressure: full pallets waiting.";
    if (emptyNeeds >= 2) return "Base workers need empties.";
    if (this.state.emptyStacks[side.key].count <= 2) return "Restock empty stack soon.";
    if (side.inbound.length >= 8) return "Assign more base labor.";
    return "Stable. Watch next trailer risk.";
  }

  drawRoster() {
    this.workers.workers.forEach((worker) => {
      const selected = this.workers.selected === worker;
      worker.rosterBox.setStrokeStyle(2, selected ? COLORS.yellow : 0x3f5663, selected ? 1 : 0.7);
      worker.rosterBox.setFillStyle(selected ? 0x26351e : 0x12202a, 0.94);
      worker.rosterText.setText(`${worker.name}  ${Math.round(worker.efficiency * 100)}%\n${worker.status}`);
      worker.rosterText.setColor(selected ? "#fef08a" : "#dbeafe");
    });
  }

  drawMapReadouts() {
    const g = this.dynamic;
    Object.values(this.state.sides).forEach((side) => {
      const zone = this.scene.zones.get(side.key);
      const blocked = side.bases.filter((base) => base.blocked).length;
      const fullWaiting = side.bases.filter((base) => base.fullPallet).length;
      this.addText(zone.x, zone.y - zone.h / 2 + 34, `Inbound ${side.inbound.length} | Full pallets ${fullWaiting}`, { color: "#e0f2fe" }, 0.5);
      this.addText(zone.x, zone.y + zone.h / 2 - 26, `Bases blocked ${blocked}/${TUNE.baseCount}`, { color: blocked ? "#fecaca" : "#bbf7d0" }, 0.5);
      side.bases.forEach((base, i) => {
        const bx = zone.x - 68 + (i % 2) * 136;
        const by = zone.y - 54 + Math.floor(i / 2) * 58;
        const fill = base.fullPallet ? base.fullPallet.color : base.blocked ? 0x4a1414 : base.color || 0x24323a;
        g.fillStyle(fill, base.fullPallet || base.boxes ? 0.9 : 0.58);
        g.fillRoundedRect(bx - 45, by - 17, 90, 34, 4);
        g.lineStyle(1, base.fullPallet ? COLORS.yellow : base.empty ? 0x7f919a : COLORS.red, 0.8);
        g.strokeRoundedRect(bx - 45, by - 17, 90, 34, 4);
        const label = base.fullPallet
          ? `${base.fullPallet.colorKey} FULL`
          : base.blocked
            ? "NEED PALLET"
            : `${base.colorKey || "OPEN"} ${base.boxes}/6`;
        this.addText(bx, by - 7, label, { fontSize: 9, color: "#f8fafc" }, 0.5);
      });
    });

    this.state.staging.lanes.forEach((lane) => {
      const fill = lane.mixed ? COLORS.red : lane.ready ? COLORS.green : lane.color || 0x22313a;
      g.fillStyle(fill, lane.pallets.length ? 0.85 : 0.42);
      g.fillRoundedRect(lane.x - 30, lane.y - 58, 60, 116, 6);
      g.lineStyle(2, lane.mixed ? COLORS.red : lane.ready ? COLORS.green : 0x647986, 0.95);
      g.strokeRoundedRect(lane.x - 30, lane.y - 58, 60, 116, 6);
      this.addText(lane.x, lane.y - 52, lane.label, { fontFamily: "Arial Black, Arial", fontSize: 10, color: "#f8fafc" }, 0.5);
      this.addText(lane.x, lane.y + 34, lane.reserved ? "RC IN" : lane.mixed ? "MIX" : lane.ready ? "GPM" : lane.colorKey ? `${lane.pallets.length}/3` : "OPEN", { fontSize: 10, color: "#f8fafc" }, 0.5);
    });

    ["primary", "secondary"].forEach((sideKey) => {
      const stackZone = this.scene.zones.get(`${sideKey}Stack`);
      const stack = this.state.emptyStacks[sideKey];
      const color = stack.count <= 1 ? "#fecaca" : stack.count <= 3 ? "#fde68a" : "#bbf7d0";
      this.addText(stackZone.x, stackZone.y + 4, `${stack.count}/${TUNE.emptyStackCapacity}`, { fontSize: 14, color }, 0.5);
    });
    const trailer = this.scene.zones.get("emptyTrailer");
    this.addText(trailer.x, trailer.y + 4, "RC RESTOCK", { fontSize: 11, color: "#fde68a" }, 0.5);
  }

  drawAlerts() {
    this.alerts.items.forEach((alert, i) => {
      const color = alert.severity === "good" ? "#bbf7d0" : alert.severity === "warn" ? "#fde68a" : "#cbd5e1";
      this.addText(456, 94 + i * 18, alert.text, { fontSize: 11, color });
    });
  }

  drawEndScreen() {
    const avg = Math.round(this.averageFlow());
    const grade = avg >= 88 ? "A" : avg >= 74 ? "B" : avg >= 58 ? "C" : avg >= 42 ? "D" : "F";
    const g = this.dynamic;
    g.fillStyle(0x05090c, 0.92);
    g.fillRoundedRect(360, 160, 560, 350, 12);
    g.lineStyle(2, COLORS.cyan, 0.7);
    g.strokeRoundedRect(360, 160, 560, 350, 12);
    this.addText(640, 190, `SHIFT COMPLETE - GRADE ${grade}`, { fontFamily: "Arial Black, Arial", fontSize: 26, color: "#f8fafc" }, 0.5);
    this.addText(410, 242, `Average flow health: ${avg}%`, { fontSize: 15 });
    this.addText(410, 272, `Clean staged pallets: ${this.state.stats.cleanPallets}`, { fontSize: 15 });
    this.addText(410, 302, `Mixed freight mistakes: ${this.state.stats.mixedMistakes}`, { fontSize: 15 });
    this.addText(410, 332, `Smooth RAA transitions: ${this.state.stats.smoothRaa}`, { fontSize: 15 });
    this.addText(410, 362, `Emergency GPM calls: ${this.state.stats.manualGpm}`, { fontSize: 15 });
    this.addText(410, 404, this.coachingNote(avg), { fontSize: 14, color: "#fde68a", wordWrap: { width: 480 } });
  }

  averageFlow() {
    if (this.state.flowSamples.length === 0) return this.state.flowHealth;
    return this.state.flowSamples.reduce((a, b) => a + b, 0) / this.state.flowSamples.length;
  }

  coachingNote(avg) {
    if (this.state.stats.missedRaa > 0) return "Coaching: RAA prep ran dry. Send the RC to build backup pallets before ART trailers hit zero.";
    if (this.state.stats.mixedMistakes > 2) return "Coaching: Staging discipline slipped. Watch the forecast and keep clean lanes open.";
    if (this.state.stats.ibtOverflow > 0) return "Coaching: Blue freight needs earlier RC attention or faster IBT trailer clears.";
    if (avg >= 88) return "Best decision: labor stayed balanced and flow remained stable.";
    return "Coaching: keep a floater available so one weak zone does not pull the whole floor down.";
  }
}

class RTSWarehouseScene extends Phaser.Scene {
  constructor() {
    super("RTSWarehouseScene");
  }

  preload() {
    const workerSource = window.WORKER_SPRITES_DATA || WORKER_SHEET.path;
    this.load.spritesheet(WORKER_SHEET.key, workerSource, {
      frameWidth: WORKER_SHEET.frameWidth,
      frameHeight: WORKER_SHEET.frameHeight,
    });
    const rcSource = window.RC_OPERATOR_SPRITES_DATA || RC_SHEET.path;
    this.load.spritesheet(RC_SHEET.key, rcSource, {
      frameWidth: RC_SHEET.frameWidth,
      frameHeight: RC_SHEET.frameHeight,
    });
  }

  create() {
    this.now = 0;
    this.createFallbackTextures();
    this.state = new GameState();
    this.alerts = new AlertManager(this);
    this.scoring = new ScoringManager(this.state, this.alerts);
    this.zones = new ZoneManager(this);
    this.workers = new WorkerManager(this, this.state, this.zones, this.alerts);
    this.flow = new FlowManager(this.state, this.workers, this.scoring, this.alerts);
    this.staging = new StagingManager(this.state, this.workers, this.scoring, this.alerts);
    this.ui = new UIManager(this, this.state, this.workers, this.zones, this.alerts);

    this.zones.drawStatic();
    this.workers.createSprites();
    this.ui.createStatic();
    this.alerts.push("Shift started. Select workers and assign them to zones.", "good");
  }

  createFallbackTextures() {
    if (this.textures.exists("workerFallback")) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x0f172a, 0.3);
    g.fillEllipse(18, 42, 28, 9);
    g.fillStyle(0xfacc15, 1);
    g.fillCircle(18, 8, 8);
    g.fillStyle(0xf97316, 1);
    g.fillRoundedRect(8, 16, 20, 24, 4);
    g.fillStyle(0x0f172a, 1);
    g.fillRect(10, 39, 6, 12);
    g.fillRect(21, 39, 6, 12);
    g.generateTexture("workerFallback", 36, 54);
    g.destroy();
  }

  handleZoneClick(assignment) {
    if (assignment === "emptyTrailer") {
      this.staging.requestEmptyPalletRestock();
      return;
    }
    if (assignment === "raaPrimary") {
      this.staging.requestRaaPrep("primary");
      return;
    }
    if (assignment === "raaSecondary") {
      this.staging.requestRaaPrep("secondary");
      return;
    }
    this.workers.assignSelected(assignment);
  }

  update(time, delta) {
    if (this.state.gameOver) {
      this.ui.update();
      return;
    }
    this.now = time;
    this.state.shiftRemaining = Math.max(0, this.state.shiftRemaining - delta);
    this.workers.update(delta);
    this.flow.update(delta);
    this.staging.update(delta);
    this.alerts.update(delta);
    this.ui.update();
    if (this.state.shiftRemaining <= 0) {
      this.state.gameOver = true;
      this.alerts.push("Shift complete. Review your grade.", "good");
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  backgroundColor: "#091017",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  scene: RTSWarehouseScene,
};

window.addEventListener("load", () => {
  if (!window.Phaser) {
    document.body.innerHTML = "<p style='color:white;font:16px sans-serif;padding:24px'>Phaser failed to load. Check the CDN connection or run with internet access.</p>";
    return;
  }
  const game = new Phaser.Game(config);
  const refreshScale = () => {
    window.requestAnimationFrame(() => game.scale.refresh());
  };
  window.addEventListener("resize", refreshScale);
  window.addEventListener("orientationchange", refreshScale);
  refreshScale();
});
