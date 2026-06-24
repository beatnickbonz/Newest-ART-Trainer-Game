/* =============================================================================
 * Scenes: Boot, Menu, ScenarioSelect, Briefing, Game, Results + Pause/Glossary/
 * Credits overlays. Shared menu helpers (backdrop, buttons, panels, stars).
 * ===========================================================================*/

/* ---------- shared menu helpers ---------- */
function buildBackdrop(scene, weather = "day") {
  scene.add.image(0, 0, "tex_concrete").setOrigin(0).setDisplaySize(GAME.W, GAME.H).setDepth(0).setTint(0x70797f);
  scene.add.tileSprite(0, 0, GAME.W, GAME.H, "tex_concrete").setOrigin(0).setDepth(1).setAlpha(0.5);
  const dark = scene.add.rectangle(0, 0, GAME.W, GAME.H, 0x05090c, 0.55).setOrigin(0).setDepth(2);
  [[260, 200], [1000, 220], [640, 540], [420, 420]].forEach(([x, y], i) => {
    scene.add.image(x, y, "fx_light").setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setAlpha(0.35);
  });
  // drifting freight icons
  FREIGHT.forEach((f, i) => {
    const img = scene.add.image(-60, 120 + i * 110, "ic_box").setDepth(4).setTint(f.color).setAlpha(0.18).setDisplaySize(46, 46);
    scene.tweens.add({ targets: img, x: GAME.W + 60, duration: 18000 + i * 4000, repeat: -1, delay: i * 2600, ease: "Linear" });
  });
  // forklift driving across
  const fork = scene.add.sprite(-100, GAME.H - 120, RC_SHEET.key, 6).setScale(RC_SHEET.scale * 1.1).setDepth(5).setAlpha(0.9);
  scene.tweens.add({ targets: fork, x: GAME.W + 120, duration: 14000, repeat: -1, ease: "Linear", onRepeat: () => fork.setFlipX(false) });
  const wt = WEATHER_TINT[weather] || WEATHER_TINT.day;
  if (wt.alpha > 0) scene.add.rectangle(0, 0, GAME.W, GAME.H, wt.color, wt.alpha + 0.05).setOrigin(0).setDepth(6);
  scene.add.image(0, 0, "fx_vignette").setOrigin(0).setDepth(7);
}

class MenuButton {
  constructor(scene, x, y, w, h, label, onClick, opts = {}) {
    this.scene = scene; this.w = w; this.h = h; this.opts = opts; this.enabled = opts.enabled !== false; this.hover = false;
    this.c = scene.add.container(x, y).setDepth(opts.depth || 50);
    this.g = scene.add.graphics();
    this.icon = opts.icon ? scene.add.image(-w / 2 + 26, 0, `ic_${opts.icon}`).setDisplaySize(22, 22) : null;
    this.label = scene.add.text(opts.icon ? -w / 2 + 46 : 0, 0, label, { fontFamily: FONTS.display, fontSize: opts.size || 18, color: CSS.text, fontStyle: "600" }).setOrigin(opts.icon ? 0 : 0.5, 0.5);
    this.sub = opts.sub ? scene.add.text(w / 2 - 12, 0, opts.sub, { fontFamily: FONTS.ui, fontSize: 11, color: CSS.muted }).setOrigin(1, 0.5) : null;
    const kids = [this.g, this.label]; if (this.icon) kids.push(this.icon); if (this.sub) kids.push(this.sub);
    this.c.add(kids);
    this.c.setSize(w, h).setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    this.c.on("pointerover", () => { this.hover = true; this.draw(); if (this.enabled) Sound.play("hover"); });
    this.c.on("pointerout", () => { this.hover = false; this.draw(); });
    this.c.on("pointerdown", () => { if (this.enabled) { Sound.play("click"); onClick(); } else Sound.play("deny"); });
    this.draw();
  }
  draw() {
    const g = this.g, w = this.w, h = this.h, col = this.opts.color || PAL.amber;
    g.clear();
    const fill = !this.enabled ? 0x0c1318 : this.hover ? shadeNum(col, -0.35) : 0x0e171d;
    g.fillStyle(fill, 0.95); g.fillRoundedRect(-w / 2, -h / 2, w, h, 9);
    g.lineStyle(2, this.enabled ? (this.hover ? col : 0x33454f) : 0x222d33, this.hover ? 1 : 0.7);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 9);
    g.fillStyle(col, this.enabled ? (this.hover ? 1 : 0.8) : 0.3); g.fillRoundedRect(-w / 2, -h / 2, 4, h, 2);
    this.label.setColor(this.enabled ? CSS.text : CSS.muted);
    if (this.icon) this.icon.setTint(this.enabled ? col : 0x55636b);
  }
  setEnabled(v) { this.enabled = v; this.draw(); }
}

function starString(n) { return "★★★".slice(0, n) + "☆☆☆".slice(0, 3 - n); }

function panel(scene, x, y, w, h, depth = 40) {
  const g = scene.add.graphics().setDepth(depth);
  glass(g, x, y, w, h, 12, 0x0a141a, 0.92, PAL.line, 0.9);
  return g;
}

/* ============================ Boot ============================ */
class BootScene extends Phaser.Scene {
  constructor() { super("BootScene"); }
  preload() {
    this.load.spritesheet(WORKER_SHEET.key, window.WORKER_SPRITES_DATA || WORKER_SHEET.path, { frameWidth: WORKER_SHEET.frameWidth, frameHeight: WORKER_SHEET.frameHeight });
    this.load.spritesheet(RC_SHEET.key, window.RC_OPERATOR_SPRITES_DATA || RC_SHEET.path, { frameWidth: RC_SHEET.frameWidth, frameHeight: RC_SHEET.frameHeight });
    Tex.loadIcons(this, 96);
  }
  create() {
    Save.load();
    Sound.initFromSave();
    Tex.generateAll(this);
    const el = document.getElementById("boot-screen");
    if (el) { el.classList.add("hidden"); setTimeout(() => el.remove(), 700); }
    this.scene.start("MenuScene");
  }
}

/* ============================ Menu ============================ */
class MenuScene extends Phaser.Scene {
  constructor() { super("MenuScene"); }
  create() {
    buildBackdrop(this, "dusk");
    this.input.on("pointerdown", () => Sound.unlock());

    // logo
    const lx = GAME.W / 2;
    const mark = this.add.graphics().setDepth(20);
    mark.fillStyle(PAL.amber, 1); mark.fillRoundedRect(lx - 188, 86, 46, 46, 9);
    mark.fillStyle(PAL.bg0, 1);
    [12, 20, 28].forEach((dx, i) => mark.fillRect(lx - 188 + dx, 96 + (i % 2 ? 0 : 6), 5, 26 - (i % 2 ? 0 : 6)));
    this.add.text(lx - 130, 90, "WAREHOUSE", { fontFamily: FONTS.display, fontSize: 40, color: CSS.white, fontStyle: "700" }).setDepth(20);
    this.add.text(lx - 130, 128, "FLOW COMMANDER", { fontFamily: FONTS.display, fontSize: 30, color: CSS.amber, fontStyle: "700" }).setDepth(20);
    this.add.text(lx, 178, "RTS WAREHOUSE OPERATIONS TRAINER", { fontFamily: FONTS.ui, fontSize: 14, color: CSS.textDim, fontStyle: "600" }).setOrigin(0.5).setDepth(20).setLetterSpacing?.(2);

    // menu buttons
    const bx = lx, by = 240, bw = 360, bh = 52, gap = 12;
    const stars = Save.totalStars();
    new MenuButton(this, bx, by, bw, bh, "CAMPAIGN", () => this.scene.start("SelectScene"), { icon: "factory", color: PAL.amber, sub: `${stars}/${SCENARIOS.length * 3} ★` });
    new MenuButton(this, bx, by + (bh + gap), bw, bh, "FREE SHIFT", () => this.startFree(), { icon: "warehouse", color: PAL.cyan });
    new MenuButton(this, bx, by + 2 * (bh + gap), bw, bh, "TUTORIAL", () => this.scene.start("BriefScene", { scenario: SCENARIOS[0], tutorial: true }), { icon: "person", color: PAL.green });
    new MenuButton(this, bx, by + 3 * (bh + gap), bw, bh, "GLOSSARY", () => this.scene.launch("GlossaryScene", { from: "MenuScene" }), { icon: "crate", color: PAL.yellow });
    new MenuButton(this, bx, by + 4 * (bh + gap), bw, bh, "CREDITS", () => this.scene.launch("CreditsScene"), { icon: "cog", color: PAL.purple, size: 16 });

    this.add.text(GAME.W / 2, GAME.H - 24, "Built with Phaser 3 · Icons CC BY game-icons.net · v2.0", { fontFamily: FONTS.ui, fontSize: 11, color: CSS.muted }).setOrigin(0.5).setDepth(20);

    if (!Save.seenTutorial()) {
      this.add.text(bx + bw / 2 + 30, by + 2 * (bh + gap), "◄ START HERE", { fontFamily: FONTS.display, fontSize: 14, color: CSS.green, fontStyle: "700" }).setOrigin(0, 0.5).setDepth(20);
    }
  }
  startFree() {
    const free = { id: "free", name: "Free Shift", tag: "FREEPLAY", difficulty: 2, weather: "day",
      subtitle: "Open practice", brief: "An open practice shift with standard volume. No campaign pressure — experiment with labor balance, RAA timing, and staging discipline.",
      tune: { shiftMs: 8 * 60 * 1000 }, objectives: [{ id: "flow", label: "Average flow health 70%+", kind: "avgFlow", target: 70 }], star2Flow: 70, star3Flow: 86 };
    this.scene.start("BriefScene", { scenario: free });
  }
}

/* ===================== Scenario Select ===================== */
class SelectScene extends Phaser.Scene {
  constructor() { super("SelectScene"); }
  create() {
    buildBackdrop(this, "day");
    this.add.text(GAME.W / 2, 40, "CAMPAIGN", { fontFamily: FONTS.display, fontSize: 32, color: CSS.white, fontStyle: "700" }).setOrigin(0.5).setDepth(20);
    this.add.text(GAME.W / 2, 74, "Each shift trains a different flow skill. Earn stars to unlock the next.", { fontFamily: FONTS.ui, fontSize: 13, color: CSS.textDim }).setOrigin(0.5).setDepth(20);

    const cols = 3, cw = 360, chh = 168, gx = 24, gy = 20;
    const totalW = cols * cw + (cols - 1) * gx;
    const startX = (GAME.W - totalW) / 2;
    SCENARIOS.forEach((sc, i) => {
      const cx = startX + (i % cols) * (cw + gx);
      const cy = 110 + Math.floor(i / cols) * (chh + gy);
      this.card(sc, i, cx, cy, cw, chh);
    });
    new MenuButton(this, 90, GAME.H - 34, 140, 38, "◄ BACK", () => this.scene.start("MenuScene"), { color: PAL.cyan, size: 15 });
  }
  card(sc, index, x, y, w, h) {
    const unlocked = Save.isUnlocked(index, SCENARIOS);
    const prog = Save.progressFor(sc.id);
    const g = this.add.graphics().setDepth(20);
    glass(g, x, y, w, h, 12, unlocked ? 0x0c1820 : 0x0a1014, 0.94, unlocked ? PAL.line : 0x202b31, 0.9);
    const accent = [PAL.green, PAL.cyan, PAL.amber, PAL.purple, PAL.orange, PAL.red][index % 6];
    g.fillStyle(accent, unlocked ? 0.9 : 0.3); g.fillRoundedRect(x, y, 6, h, 3);
    this.add.text(x + 22, y + 16, `SHIFT ${index + 1} · ${sc.tag}`, { fontFamily: FONTS.ui, fontSize: 11, color: unlocked ? CSS.amber : CSS.muted, fontStyle: "600" }).setDepth(21);
    this.add.text(x + 22, y + 34, sc.name, { fontFamily: FONTS.display, fontSize: 24, color: unlocked ? CSS.white : CSS.muted, fontStyle: "700" }).setDepth(21);
    this.add.text(x + 22, y + 66, sc.subtitle, { fontFamily: FONTS.ui, fontSize: 12, color: CSS.textDim, wordWrap: { width: w - 44 } }).setDepth(21);
    // difficulty
    this.add.text(x + 22, y + h - 30, "DIFFICULTY", { fontFamily: FONTS.ui, fontSize: 10, color: CSS.muted }).setDepth(21);
    for (let d = 0; d < 5; d++) { this.add.rectangle(x + 96 + d * 12, y + h - 25, 8, 8, d < sc.difficulty ? accent : 0x2a3942).setDepth(21); }
    // stars
    this.add.text(x + w - 18, y + h - 30, starString(prog.stars), { fontFamily: FONTS.ui, fontSize: 18, color: prog.stars ? CSS.yellow : "#2a3942" }).setOrigin(1, 0).setDepth(21);

    if (unlocked) {
      const hit = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true }).setDepth(22);
      hit.on("pointerover", () => { g.clear(); glass(g, x, y, w, h, 12, 0x12222c, 0.96, accent, 1); g.fillStyle(accent, 0.9); g.fillRoundedRect(x, y, 6, h, 3); Sound.play("hover"); });
      hit.on("pointerout", () => { g.clear(); glass(g, x, y, w, h, 12, 0x0c1820, 0.94, PAL.line, 0.9); g.fillStyle(accent, 0.9); g.fillRoundedRect(x, y, 6, h, 3); });
      hit.on("pointerdown", () => { Sound.play("click"); this.scene.start("BriefScene", { scenario: sc }); });
    } else {
      this.add.image(x + w - 26, y + 28, "ic_cog").setDisplaySize(18, 18).setTint(0x55636b).setDepth(21);
      this.add.text(x + w / 2, y + h / 2 + 10, "LOCKED", { fontFamily: FONTS.display, fontSize: 16, color: CSS.muted, fontStyle: "700" }).setOrigin(0.5).setDepth(21);
    }
  }
}

/* ========================= Briefing ========================= */
class BriefScene extends Phaser.Scene {
  constructor() { super("BriefScene"); }
  init(data) { this.scenario = data.scenario; this.tutorial = data.tutorial; }
  create() {
    buildBackdrop(this, this.scenario.weather);
    const x = GAME.W / 2 - 320, y = 90, w = 640;
    panel(this, x, y, w, 480, 20);
    this.add.text(x + 30, y + 26, this.tutorial ? "TRAINING BRIEF" : `${this.scenario.tag} · SHIFT BRIEF`, { fontFamily: FONTS.ui, fontSize: 13, color: CSS.amber, fontStyle: "600" }).setDepth(30);
    this.add.text(x + 30, y + 44, this.scenario.name, { fontFamily: FONTS.display, fontSize: 34, color: CSS.white, fontStyle: "700" }).setDepth(30);
    this.add.text(x + 30, y + 92, this.scenario.subtitle, { fontFamily: FONTS.ui, fontSize: 15, color: CSS.cyan }).setDepth(30);
    this.add.text(x + 30, y + 124, this.scenario.brief, { fontFamily: FONTS.ui, fontSize: 14, color: CSS.textDim, wordWrap: { width: w - 60 }, lineSpacing: 4 }).setDepth(30);

    this.add.text(x + 30, y + 224, "OBJECTIVES", { fontFamily: FONTS.display, fontSize: 16, color: CSS.amber, fontStyle: "700" }).setDepth(30);
    (this.scenario.objectives || []).forEach((o, i) => {
      this.add.image(x + 40, y + 262 + i * 30, "ic_cog").setDisplaySize(14, 14).setTint(PAL.green).setDepth(30);
      this.add.text(x + 56, y + 254 + i * 30, o.label, { fontFamily: FONTS.ui, fontSize: 14, color: CSS.text }).setDepth(30);
    });

    // modifiers summary
    const t = Object.assign({}, TUNE, this.scenario.tune || {});
    const mods = [`Shift ${Math.round(t.shiftMs / 60000)} min`, `Staff ${t.staff}`, `ART cap ${t.artCapacity}`];
    if (this.scenario.tune?.blueWeight) mods.push(`Blue ${this.scenario.tune.blueWeight}%`);
    this.add.text(x + 30, y + 372, "CONDITIONS:  " + mods.join("   ·   "), { fontFamily: FONTS.ui, fontSize: 12, color: CSS.muted }).setDepth(30);

    new MenuButton(this, x + w - 140, y + 432, 220, 46, this.tutorial ? "BEGIN TRAINING" : "START SHIFT", () => this.scene.start("GameScene", { scenario: this.scenario, tutorial: this.tutorial }), { color: PAL.green, icon: "forklift" });
    new MenuButton(this, x + 96, y + 432, 150, 46, "◄ BACK", () => this.scene.start(this.tutorial ? "MenuScene" : "SelectScene"), { color: PAL.cyan, size: 15 });
  }
}

/* =========================== Game =========================== */
class GameScene extends Phaser.Scene {
  constructor() { super("GameScene"); }
  init(data) { this.scenario = data.scenario || SCENARIOS[0]; this.tutorial = !!data.tutorial; this.ended = false; }
  create() {
    this.now = 0;
    Sound.unlock(); Sound.startAmbient();
    this.sim = new Sim(this.scenario);
    this.world = new WorldRenderer(this, this.sim, { weather: this.scenario.weather });
    this.uiM = new UIManager(this, this.sim); this.uiM.build();
    this.input.on("pointerdown", () => Sound.unlock());
    this.startBanner();
    if (this.tutorial) this.tut = new Tutorial(this, this.sim);
    this.events.on("shutdown", () => { Sound.stopAmbient(); });
  }

  startBanner() {
    const t1 = this.add.text(GAME.W / 2, GAME.H / 2 - 20, "SHIFT START", { fontFamily: FONTS.display, fontSize: 56, color: CSS.white, fontStyle: "700" }).setOrigin(0.5).setDepth(1500).setAlpha(0);
    const t2 = this.add.text(GAME.W / 2, GAME.H / 2 + 30, this.scenario.name, { fontFamily: FONTS.ui, fontSize: 20, color: CSS.amber }).setOrigin(0.5).setDepth(1500).setAlpha(0);
    this.tweens.add({ targets: [t1, t2], alpha: 1, duration: 400, yoyo: true, hold: 900, onComplete: () => { t1.destroy(); t2.destroy(); } });
  }

  onZoneClick(assignment) {
    if (this.sim.state.paused || this.sim.state.gameOver) return;
    if (assignment === "emptyTrailer") return this.sim.rc.requestRestock();
    if (assignment === "raaPrimary") return this.sim.rc.requestRaaPrep("primary");
    if (assignment === "raaSecondary") return this.sim.rc.requestRaaPrep("secondary");
    if (assignment === "ibt") return this.sim.staging.requestIbt();
  }
  onBaseClick(base) {
    if (this.sim.state.paused || this.sim.state.gameOver) return;
    this.sim.rc.requestHaulAt(base);
  }
  togglePause() {
    if (this.sim.state.gameOver) return;
    if (this.sim.state.paused) { this.sim.state.paused = false; this.scene.stop("PauseScene"); }
    else { this.sim.state.paused = true; this.scene.launch("PauseScene", { game: this }); }
  }
  toggleMute() { const m = !Sound.isMuted(); Sound.setMuted(m); Save.setSetting("muted", m); }
  openGlossary() { if (!this.sim.state.gameOver) { this.sim.state.paused = true; this.scene.launch("GlossaryScene", { from: "GameScene", game: this }); } }

  update(time, delta) {
    this.now = time;
    const dt = Math.min(delta, 50);
    this.sim.update(dt);
    this.world.update(dt, time);
    this.uiM.update();
    if (this.tut) this.tut.update();
    if (this.sim.state.gameOver && !this.ended) {
      this.ended = true;
      const result = this.sim.evaluate();
      if (!this.tutorial) Save.recordResult(this.scenario.id, result);
      if (this.tutorial) Save.markTutorialSeen();
      this.time.delayedCall(1200, () => this.scene.start("ResultsScene", { scenario: this.scenario, result, tutorial: this.tutorial }));
    }
  }
}

/* ========================== Results ========================== */
class ResultsScene extends Phaser.Scene {
  constructor() { super("ResultsScene"); }
  init(data) { this.scenario = data.scenario; this.result = data.result; this.tutorial = data.tutorial; }
  create() {
    buildBackdrop(this, this.scenario.weather);
    const r = this.result, avg = Math.round(r.avgFlow);
    const grade = avg >= 88 ? "A" : avg >= 74 ? "B" : avg >= 58 ? "C" : avg >= 42 ? "D" : "F";
    const x = GAME.W / 2 - 340, y = 60, w = 680;
    panel(this, x, y, w, 540, 20);
    this.add.text(GAME.W / 2, y + 30, this.tutorial ? "TRAINING COMPLETE" : "SHIFT COMPLETE", { fontFamily: FONTS.ui, fontSize: 14, color: CSS.amber, fontStyle: "600" }).setOrigin(0.5).setDepth(30);
    this.add.text(GAME.W / 2, y + 56, this.scenario.name, { fontFamily: FONTS.display, fontSize: 34, color: CSS.white, fontStyle: "700" }).setOrigin(0.5).setDepth(30);

    // grade + stars
    this.add.text(x + 90, y + 150, grade, { fontFamily: FONTS.display, fontSize: 92, color: grade === "F" ? CSS.red : grade === "A" ? CSS.green : CSS.amber, fontStyle: "700" }).setOrigin(0.5).setDepth(30);
    this.add.text(x + 90, y + 214, "GRADE", { fontFamily: FONTS.ui, fontSize: 12, color: CSS.muted }).setOrigin(0.5).setDepth(30);
    this.animateStars(x + 230, y + 130, r.stars);

    // key stats
    const stats = [
      ["Average flow", `${avg}%`], ["Final score", `${r.score}`],
      ["Clean lanes", `${r.stats.cleanLanes}`], ["Mixed mistakes", `${r.stats.mixedMistakes}`],
      ["Smooth RAA", `${r.stats.smoothRaa}`], ["Missed RAA", `${r.stats.missedRaa}`],
      ["IBT overflows", `${r.stats.ibtOverflow}`], ["Manual GPM", `${r.stats.manualGpm}`],
    ];
    stats.forEach((s, i) => {
      const sx = x + 220 + (i % 2) * 230, sy = y + 188 + Math.floor(i / 2) * 26;
      this.add.text(sx, sy, s[0], { fontFamily: FONTS.ui, fontSize: 13, color: CSS.muted }).setDepth(30);
      this.add.text(sx + 200, sy, s[1], { fontFamily: FONTS.ui, fontSize: 13, color: CSS.text, fontStyle: "600" }).setOrigin(1, 0).setDepth(30);
    });

    // objectives
    this.add.text(x + 30, y + 330, "OBJECTIVES", { fontFamily: FONTS.display, fontSize: 15, color: CSS.amber, fontStyle: "700" }).setDepth(30);
    r.objectives.forEach((o, i) => {
      this.add.text(x + 30, y + 358 + i * 24, (o.pass ? "✓ " : "✗ ") + o.label, { fontFamily: FONTS.ui, fontSize: 13, color: o.pass ? CSS.green : CSS.red }).setDepth(30);
    });

    // flow timeline graph
    this.drawTimeline(x + 360, y + 348, 290, 90);
    // coaching
    this.add.text(x + 30, y + 440, "COACHING", { fontFamily: FONTS.display, fontSize: 15, color: CSS.cyan, fontStyle: "700" }).setDepth(30);
    this.add.text(x + 30, y + 464, this.coaching(r), { fontFamily: FONTS.ui, fontSize: 13, color: CSS.textDim, wordWrap: { width: w - 60 }, lineSpacing: 3 }).setDepth(30);

    // buttons
    const nextIdx = SCENARIOS.findIndex((s) => s.id === this.scenario.id) + 1;
    const hasNext = !this.tutorial && this.scenario.id !== "free" && nextIdx < SCENARIOS.length && r.stars > 0;
    new MenuButton(this, x + 110, y + 512, 180, 42, "MENU", () => this.scene.start("MenuScene"), { color: PAL.cyan, size: 15 });
    new MenuButton(this, x + 310, y + 512, 180, 42, "REPLAY", () => this.scene.start("GameScene", { scenario: this.scenario, tutorial: this.tutorial }), { color: PAL.amber, size: 15, icon: "cog" });
    if (this.tutorial) new MenuButton(this, x + 510, y + 512, 180, 42, "TO CAMPAIGN", () => this.scene.start("SelectScene"), { color: PAL.green, size: 15 });
    else if (hasNext) new MenuButton(this, x + 510, y + 512, 180, 42, "NEXT SHIFT", () => this.scene.start("BriefScene", { scenario: SCENARIOS[nextIdx] }), { color: PAL.green, size: 15, icon: "forklift" });

    Sound.play(r.stars >= 2 ? "fanfare" : "shiftEnd");
  }
  animateStars(cx, cy, stars) {
    for (let i = 0; i < 3; i++) {
      const s = this.add.text(cx + i * 44, cy, "★", { fontFamily: FONTS.ui, fontSize: 40, color: "#2a3942" }).setOrigin(0.5).setDepth(30);
      if (i < stars) this.time.delayedCall(300 + i * 280, () => { s.setColor(CSS.yellow); s.setScale(1.6); this.tweens.add({ targets: s, scale: 1, duration: 300, ease: "Back.out" }); Sound.play("star", i); });
    }
  }
  drawTimeline(x, y, w, h) {
    const data = this.result.timeline || [];
    const g = this.add.graphics().setDepth(30);
    glass(g, x, y, w, h, 8, 0x0a141a, 0.7, PAL.line, 0.6);
    this.add.text(x + 8, y + 4, "FLOW TIMELINE", { fontFamily: FONTS.ui, fontSize: 10, color: CSS.muted }).setDepth(31);
    if (!data.length) return;
    g.lineStyle(2, PAL.green, 0.9); g.beginPath();
    data.forEach((v, i) => { const px = x + 8 + (i / (data.length - 1)) * (w - 16); const py = y + h - 8 - (v / 100) * (h - 26); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); });
    g.strokePath();
    [40, 70].forEach((thr) => { const ly = y + h - 8 - (thr / 100) * (h - 26); g.lineStyle(1, thr >= 70 ? PAL.green : PAL.yellow, 0.25); g.lineBetween(x + 8, ly, x + w - 8, ly); });
  }
  coaching(r) {
    if (r.stats.missedRaa > 0) return "RAA prep ran dry. Send the RC to pre-build backup pallets before ART trailers hit zero — that keeps a dock alive through a trailer swap.";
    if (r.stats.mixedMistakes > 2) return "Staging discipline slipped. Watch each dock's forecast and keep clean color lanes open so finished pallets never mix.";
    if (r.stats.ibtOverflow > 0) return "Blue Transfer freight backed up. Route the RC to IBT sooner and clear IBT before it overflows.";
    if (r.stats.manualGpm > 0) return "Emergency GPM was called. Rely on the timed GPM sweep and rework instead — manual clears cost score.";
    if (r.avgFlow >= 85) return "Excellent command. Labor stayed balanced and the floor never choked. Try a higher difficulty.";
    return "Solid shift. Keep a floater free to reinforce the weakest zone, and pre-empt trailer swaps with early RAA prep.";
  }
}

/* ===================== overlays ===================== */
class PauseScene extends Phaser.Scene {
  constructor() { super("PauseScene"); }
  init(data) { this.game1 = data.game; }
  create() {
    this.add.rectangle(0, 0, GAME.W, GAME.H, 0x05090c, 0.72).setOrigin(0).setDepth(2000).setInteractive();
    panel(this, GAME.W / 2 - 180, GAME.H / 2 - 150, 360, 300, 2001);
    this.add.text(GAME.W / 2, GAME.H / 2 - 110, "PAUSED", { fontFamily: FONTS.display, fontSize: 36, color: CSS.white, fontStyle: "700" }).setOrigin(0.5).setDepth(2002);
    new MenuButton(this, GAME.W / 2, GAME.H / 2 - 40, 300, 46, "RESUME", () => this.resume(), { color: PAL.green, depth: 2002, icon: "forklift" });
    new MenuButton(this, GAME.W / 2, GAME.H / 2 + 16, 300, 46, "GLOSSARY", () => { this.scene.launch("GlossaryScene", { from: "PauseScene" }); }, { color: PAL.yellow, depth: 2002, icon: "crate", size: 16 });
    new MenuButton(this, GAME.W / 2, GAME.H / 2 + 72, 300, 46, "QUIT TO MENU", () => { this.game1.sim.state.paused = false; this.scene.stop("GameScene"); this.scene.stop(); this.scene.start("MenuScene"); }, { color: PAL.red, depth: 2002, size: 16 });
    this.input.keyboard.on("keydown-SPACE", () => this.resume());
    this.input.keyboard.on("keydown-ESC", () => this.resume());
  }
  resume() { if (this.game1) this.game1.sim.state.paused = false; this.scene.stop(); }
}

class GlossaryScene extends Phaser.Scene {
  constructor() { super("GlossaryScene"); }
  init(data) { this.from = data.from; this.game1 = data.game; }
  create() {
    this.add.rectangle(0, 0, GAME.W, GAME.H, 0x05090c, 0.8).setOrigin(0).setDepth(2000).setInteractive();
    const x = GAME.W / 2 - 360, y = 50, w = 720;
    panel(this, x, y, w, 600, 2001);
    this.add.text(GAME.W / 2, y + 28, "WAREHOUSE GLOSSARY", { fontFamily: FONTS.display, fontSize: 28, color: CSS.white, fontStyle: "700" }).setOrigin(0.5).setDepth(2002);
    this.add.text(GAME.W / 2, y + 58, "Know the floor language a flow commander uses every shift.", { fontFamily: FONTS.ui, fontSize: 13, color: CSS.textDim }).setOrigin(0.5).setDepth(2002);
    GLOSSARY.forEach((t, i) => {
      const ty = y + 88 + i * 60;
      const g = this.add.graphics().setDepth(2002);
      glass(g, x + 24, ty, w - 48, 52, 8, 0x0c1820, 0.7, PAL.line, 0.5);
      this.add.image(x + 50, ty + 26, `ic_${t.icon}`).setDisplaySize(24, 24).setTint(PAL.amber).setDepth(2003);
      this.add.text(x + 76, ty + 8, t.term, { fontFamily: FONTS.display, fontSize: 16, color: CSS.amber, fontStyle: "700" }).setDepth(2003);
      this.add.text(x + 76, ty + 28, t.text, { fontFamily: FONTS.ui, fontSize: 12, color: CSS.textDim, wordWrap: { width: w - 120 } }).setDepth(2003);
    });
    new MenuButton(this, GAME.W / 2, y + 572, 200, 42, "CLOSE", () => this.close(), { color: PAL.cyan, depth: 2002, size: 15 });
    this.input.keyboard.on("keydown-ESC", () => this.close());
    this.input.keyboard.on("keydown-T", () => this.close());
  }
  close() {
    if (this.from === "GameScene" && this.game1) this.game1.sim.state.paused = false;
    if (this.from === "PauseScene") { /* keep pause */ }
    this.scene.stop();
  }
}

class CreditsScene extends Phaser.Scene {
  constructor() { super("CreditsScene"); }
  create() {
    this.add.rectangle(0, 0, GAME.W, GAME.H, 0x05090c, 0.82).setOrigin(0).setDepth(2000).setInteractive();
    const x = GAME.W / 2 - 320, y = 110, w = 640;
    panel(this, x, y, w, 440, 2001);
    this.add.text(GAME.W / 2, y + 30, "CREDITS & LICENSES", { fontFamily: FONTS.display, fontSize: 28, color: CSS.white, fontStyle: "700" }).setOrigin(0.5).setDepth(2002);
    const lines = [
      ["Engine", "Phaser 3.80 — MIT License"],
      ["Display font", "Oswald — SIL Open Font License"],
      ["UI font", "Barlow Semi Condensed — SIL Open Font License"],
      ["Icons", "game-icons.net — Delapouite & Lorc, CC BY 3.0"],
      ["Worker & forklift art", "Provided sprite sheets, processed for the game"],
      ["Audio", "Synthesized in-browser via Web Audio API"],
      ["Design & code", "Warehouse Flow Commander — rebuilt 2.0"],
    ];
    lines.forEach((l, i) => {
      const ly = y + 80 + i * 44;
      this.add.text(x + 36, ly, l[0], { fontFamily: FONTS.ui, fontSize: 13, color: CSS.amber, fontStyle: "600" }).setDepth(2002);
      this.add.text(x + 200, ly, l[1], { fontFamily: FONTS.ui, fontSize: 13, color: CSS.textDim, wordWrap: { width: w - 230 } }).setDepth(2002);
    });
    new MenuButton(this, GAME.W / 2, y + 408, 200, 42, "CLOSE", () => this.scene.stop(), { color: PAL.cyan, depth: 2002, size: 15 });
    this.input.keyboard.on("keydown-ESC", () => this.scene.stop());
  }
}

window.SCENES = { BootScene, MenuScene, SelectScene, BriefScene, GameScene, ResultsScene, PauseScene, GlossaryScene, CreditsScene };
