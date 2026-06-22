/* =============================================================================
 * UIManager: floating glass HUD over the world. Top bar (score/flow/shift/
 * objectives), left roster, right ops panels, bottom command bar, toasts,
 * tooltips, score pops, and keyboard shortcuts.
 * ===========================================================================*/

const D = { panel: 1000, dyn: 1001, text: 1002, btn: 1004, toast: 1060, pop: 1080, tip: 1120 };

function glass(g, x, y, w, h, r, fill = 0x0a141a, alpha = 0.84, border = PAL.line, ba = 0.8) {
  g.fillStyle(fill, alpha); g.fillRoundedRect(x, y, w, h, r);
  g.fillStyle(0xffffff, 0.04); g.fillRoundedRect(x, y, w, Math.min(18, h), r);
  g.lineStyle(1.5, border, ba); g.strokeRoundedRect(x, y, w, h, r);
}

class Tooltip {
  constructor(scene) {
    this.scene = scene;
    this.bg = scene.add.graphics().setDepth(D.tip).setVisible(false);
    this.txt = scene.add.text(0, 0, "", { fontFamily: FONTS.ui, fontSize: 12, color: CSS.text, wordWrap: { width: 220 } }).setDepth(D.tip + 1).setVisible(false);
  }
  show(x, y, text) {
    this.txt.setText(text);
    const w = Math.min(236, this.txt.width + 16), h = this.txt.height + 12;
    let px = clamp(x - w / 2, 6, GAME.W - w - 6);
    let py = y - h - 12; if (py < 6) py = y + 20;
    this.bg.clear(); glass(this.bg, px, py, w, h, 6, 0x05090c, 0.96, PAL.amber, 0.5);
    this.txt.setPosition(px + 8, py + 6).setWordWrapWidth(w - 16);
    this.bg.setVisible(true); this.txt.setVisible(true);
  }
  hide() { this.bg.setVisible(false); this.txt.setVisible(false); }
}

class UIButton {
  constructor(scene, o) {
    this.scene = scene; this.o = o; this.enabled = true; this.active = false; this.hover = false;
    this.c = scene.add.container(o.x, o.y).setDepth(D.btn).setSize(o.w, o.h);
    this.g = scene.add.graphics();
    this.icon = o.icon ? scene.add.image(-o.w / 2 + 18, 0, `ic_${o.icon}`).setDisplaySize(16, 16) : null;
    this.label = scene.add.text(o.icon ? -o.w / 2 + 32 : 0, 0, o.label, { fontFamily: FONTS.ui, fontSize: 12.5, color: CSS.text, fontStyle: "600" }).setOrigin(o.icon ? 0 : 0.5, 0.5);
    this.keyBadge = o.key ? scene.add.text(o.w / 2 - 12, -o.h / 2 + 9, o.key, { fontFamily: FONTS.ui, fontSize: 9, color: CSS.muted }).setOrigin(0.5) : null;
    const kids = [this.g, this.label]; if (this.icon) kids.push(this.icon); if (this.keyBadge) kids.push(this.keyBadge);
    this.c.add(kids);
    this.c.setInteractive(new Phaser.Geom.Rectangle(-o.w / 2, -o.h / 2, o.w, o.h), Phaser.Geom.Rectangle.Contains);
    this.c.on("pointerover", () => { this.hover = true; Sound.play("hover"); if (o.tip) scene.ui.tooltip.show(o.x, o.y - o.h / 2, o.tip); });
    this.c.on("pointerout", () => { this.hover = false; scene.ui.tooltip.hide(); });
    this.c.on("pointerdown", () => { if (this.enabled) { Sound.play("click"); o.onClick(); } else Sound.play("deny"); });
    this.redraw();
  }
  setEnabled(v) { if (this.enabled !== v) { this.enabled = v; this.redraw(); } }
  setActive(v) { if (this.active !== v) { this.active = v; this.redraw(); } }
  redraw() {
    const o = this.o, g = this.g; g.clear();
    const col = o.color || PAL.steelLight;
    const fill = !this.enabled ? 0x10171c : this.active ? shadeNum(col, -0.3) : this.hover ? shadeNum(col, -0.45) : 0x141e24;
    g.fillStyle(fill, this.enabled ? 0.96 : 0.5); g.fillRoundedRect(-o.w / 2, -o.h / 2, o.w, o.h, 7);
    g.lineStyle(1.5, this.active ? col : this.hover ? col : 0x3a4b55, this.enabled ? (this.active ? 1 : 0.7) : 0.3);
    g.strokeRoundedRect(-o.w / 2, -o.h / 2, o.w, o.h, 7);
    if (this.active) { g.fillStyle(col, 0.9); g.fillRoundedRect(-o.w / 2, o.h / 2 - 3, o.w, 3, 2); }
    this.label.setColor(this.enabled ? CSS.text : CSS.muted);
    if (this.icon) this.icon.setTint(this.enabled ? (o.color || 0xffffff) : 0x55636b);
  }
  setHover(v) { if (this.hover !== v) { this.hover = v; this.redraw(); } }
}

class UIManager {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim;
    scene.ui = this;
    this.buttons = {};
    this.portraits = [];
    this.toastObjs = [];
    this.lastAlertCount = 0;
  }

  build() {
    const s = this.scene;
    this.tooltip = new Tooltip(s);
    this.panelG = s.add.graphics().setDepth(D.panel);
    this.dyn = s.add.graphics().setDepth(D.dyn);
    this.drawPanels();
    this.buildHud();
    this.buildRoster();
    this.buildOps();
    this.buildCommandBar();
    this.bindKeys();
  }

  drawPanels() {
    const g = this.panelG; const P = LAYOUT.panels;
    glass(g, P.hud.x + 6, P.hud.y + 6, P.hud.w - 12, P.hud.h - 6, 8);
    glass(g, P.roster.x, P.roster.y, P.roster.w, P.roster.h, 10);
    glass(g, P.ops.x, P.ops.y, P.ops.w, P.ops.h, 10);
    glass(g, P.command.x + 6, P.command.y, P.command.w - 12, P.command.h - 6, 8);
  }

  /* ---------------- HUD ---------------- */
  buildHud() {
    const s = this.scene;
    // brand mark
    const bg = s.add.graphics().setDepth(D.text);
    bg.fillStyle(PAL.amber, 1); bg.fillRoundedRect(16, 14, 34, 34, 7);
    bg.fillStyle(PAL.bg0, 1);
    [10, 16, 22].forEach((dx, i) => bg.fillRect(16 + dx, 22 + (i % 2 ? 0 : 4), 4, 18 - (i % 2 ? 0 : 4)));
    s.add.text(58, 16, "WAREHOUSE FLOW COMMANDER", { fontFamily: FONTS.display, fontSize: 18, color: CSS.white, fontStyle: "700" }).setDepth(D.text);
    this.hudScenario = s.add.text(59, 38, "", { fontFamily: FONTS.ui, fontSize: 12, color: CSS.amber, fontStyle: "600" }).setDepth(D.text);

    // center stats
    this.scoreT = s.add.text(560, 12, "0", { fontFamily: FONTS.display, fontSize: 24, color: CSS.white, fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);
    s.add.text(560, 42, "SCORE", { fontFamily: FONTS.ui, fontSize: 10, color: CSS.muted }).setOrigin(0.5, 0).setDepth(D.text);

    this.flowT = s.add.text(722, 8, "100%", { fontFamily: FONTS.display, fontSize: 20, color: CSS.green, fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);
    s.add.text(722, 46, "FLOW HEALTH", { fontFamily: FONTS.ui, fontSize: 10, color: CSS.muted }).setOrigin(0.5, 0).setDepth(D.text);

    this.shiftT = s.add.text(880, 12, "0:00", { fontFamily: FONTS.display, fontSize: 22, color: CSS.text, fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);
    s.add.text(880, 44, "SHIFT", { fontFamily: FONTS.ui, fontSize: 10, color: CSS.muted }).setOrigin(0.5, 0).setDepth(D.text);

    // objectives chips area (right of center)
    this.objChips = [];
    const objs = this.sim.scenario.objectives || [];
    objs.slice(0, 2).forEach((o, i) => {
      const x = 896 + i * 150;
      const icon = s.add.image(x + 12, 31, "ic_cog").setDisplaySize(13, 13).setTint(PAL.cyan).setDepth(D.text);
      const t = s.add.text(x + 24, 16, "", { fontFamily: FONTS.ui, fontSize: 10.5, color: CSS.textDim, wordWrap: { width: 106 }, lineSpacing: -2 }).setDepth(D.text);
      this.objChips.push({ o, icon, t, x });
    });

    // pause + sound (top-right corner)
    this.pauseBtn = new UIButton(s, { x: 1208, y: 31, w: 40, h: 30, label: "II", color: PAL.cyan, tip: "Pause (Space)", onClick: () => this.scene.togglePause() });
    this.soundBtn = new UIButton(s, { x: 1252, y: 31, w: 36, h: 30, label: Sound.isMuted() ? "♪/" : "♪", color: PAL.amber, tip: "Mute / unmute (M)", onClick: () => this.scene.toggleMute() });
  }

  drawHud() {
    const st = this.sim.state;
    this.hudScenario.setText(`${this.sim.scenario.tag} · ${this.sim.scenario.name.toUpperCase()}`);
    this.scoreT.setText(`${st.score}`);
    const h = Math.round(st.flowHealth);
    const fcol = h >= 70 ? CSS.green : h >= 40 ? CSS.yellow : CSS.red;
    this.flowT.setText(`${h}%`).setColor(fcol);
    this.shiftT.setText(formatTime(st.shiftRemaining));

    // flow gauge bar under the number
    const g = this.dyn;
    const gx = 666, gw = 112, gy = 34;
    g.fillStyle(0x1a242b, 1); g.fillRoundedRect(gx, gy, gw, 8, 4);
    const fc = h >= 70 ? PAL.green : h >= 40 ? PAL.yellow : PAL.red;
    g.fillStyle(fc, 0.95); g.fillRoundedRect(gx, gy, gw * (h / 100), 8, 4);
    for (let t = 0; t <= 1; t += 0.25) { g.lineStyle(1, 0x0a141a, 0.8); g.lineBetween(gx + gw * t, gy, gx + gw * t, gy + 8); }
    // shift progress
    const sp = 1 - st.shiftRemaining / st.shiftTotal;
    g.fillStyle(0x1a242b, 1); g.fillRoundedRect(842, 38, 76, 6, 3);
    g.fillStyle(PAL.cyan, 0.9); g.fillRoundedRect(842, 38, 76 * sp, 6, 3);

    // objective chips live status
    this.objChips.forEach((c) => {
      const r = this.liveObjective(c.o);
      c.t.setText(`${c.o.label}`);
      c.icon.setTint(r.pass ? PAL.green : r.danger ? PAL.red : PAL.cyan);
      c.t.setColor(r.pass ? CSS.green : r.danger ? CSS.red : CSS.textDim);
      // chip frame
      g.lineStyle(1, r.pass ? PAL.green : r.danger ? PAL.red : PAL.line, 0.5);
      g.strokeRoundedRect(c.x, 12, 138, 38, 6);
    });
  }

  liveObjective(o) {
    const s = this.sim.state;
    if (o.kind === "finalFlow") { const v = Math.round(s.flowHealth); return { pass: v >= o.target, danger: v < o.target * 0.7 }; }
    if (o.kind === "avgFlow") { const v = Math.round(this.sim.avgFlow()); return { pass: v >= o.target, danger: v < o.target * 0.7 }; }
    if (o.kind === "avgUtil") { const v = Math.round(this.sim.avgUtil()); return { pass: v >= o.target, danger: v < o.target * 0.7 }; }
    if (o.kind === "stat") { const v = s.stats[o.stat] || 0; return { pass: v >= o.target, danger: false }; }
    if (o.kind === "statMax") { const v = s.stats[o.stat] || 0; return { pass: v <= o.target, danger: v > o.target }; }
    return { pass: false, danger: false };
  }

  /* ---------------- Roster ---------------- */
  buildRoster() {
    const s = this.scene; const P = LAYOUT.panels.roster;
    s.add.text(P.x + 14, P.y + 12, "TEAM", { fontFamily: FONTS.display, fontSize: 15, color: CSS.cyan, fontStyle: "700" }).setDepth(D.text);
    this.rosterCards = [];
    const workers = this.sim.workers.workers;
    const top = P.y + 38, ch = (P.h - 50) / workers.length;
    workers.forEach((w, i) => {
      const cy = top + i * ch;
      const portrait = s.add.sprite(P.x + 24, cy + ch / 2, WORKER_SHEET.key, ((w.id - 1) % 4) * 7).setScale(0.3).setDepth(D.text);
      const name = s.add.text(P.x + 44, cy + 8, `${w.name}`, { fontFamily: FONTS.ui, fontSize: 13, color: CSS.text, fontStyle: "600" }).setDepth(D.text);
      const key = s.add.text(P.x + P.w - 14, cy + 8, `${w.id}`, { fontFamily: FONTS.ui, fontSize: 11, color: CSS.muted }).setOrigin(1, 0).setDepth(D.text);
      const role = s.add.text(P.x + 44, cy + 26, "", { fontFamily: FONTS.ui, fontSize: 11, color: CSS.amber }).setDepth(D.text);
      const status = s.add.text(P.x + 44, cy + 42, "", { fontFamily: FONTS.ui, fontSize: 10, color: CSS.muted, wordWrap: { width: P.w - 56 } }).setDepth(D.text);
      const hit = s.add.zone(P.x + P.w / 2, cy + ch / 2, P.w, ch).setInteractive({ useHandCursor: true }).setDepth(D.btn);
      hit.on("pointerdown", () => this.sim.workers.select(w));
      this.rosterCards.push({ w, cy, ch, portrait, name, role, status, key });
    });
  }

  drawRoster() {
    const g = this.dyn; const P = LAYOUT.panels.roster;
    this.rosterCards.forEach((c) => {
      const sel = this.sim.workers.selected === c.w;
      g.fillStyle(sel ? 0x1c2a1e : 0x111c22, sel ? 0.95 : 0.7);
      g.fillRoundedRect(P.x + 6, c.cy + 2, P.w - 12, c.ch - 4, 7);
      g.lineStyle(sel ? 2 : 1, sel ? PAL.amber : 0x2c3b44, sel ? 1 : 0.6);
      g.strokeRoundedRect(P.x + 6, c.cy + 2, P.w - 12, c.ch - 4, 7);
      const assignment = c.w.assignment;
      c.role.setText(ASSIGNMENT_LABELS[assignment] || "Idle").setColor(assignment === "idle" ? CSS.muted : CSS.amber);
      c.status.setText(c.w.status);
      c.portrait.setTint(sel ? 0xfff0c0 : 0xffffff);
      // efficiency pips
      const ex = P.x + 44, ey = c.cy + c.ch - 14;
      for (let k = 0; k < 5; k++) {
        g.fillStyle(k < Math.round(c.w.efficiency * 5) ? PAL.green : 0x2a3942, 1);
        g.fillRect(ex + k * 9, ey, 6, 4);
      }
    });
  }

  /* ---------------- Ops panels ---------------- */
  buildOps() {
    const s = this.scene; const P = LAYOUT.panels.ops;
    s.add.text(P.x + 14, P.y + 12, "OPERATIONS", { fontFamily: FONTS.display, fontSize: 14, color: CSS.amber, fontStyle: "700" }).setDepth(D.text);
    this.ops = {};
    const mk = (n, x, y, color) => s.add.text(x, y, "", { fontFamily: FONTS.ui, fontSize: n, color, fontStyle: "500" }).setDepth(D.text);
    ["primary", "secondary"].forEach((k, idx) => {
      const y0 = P.y + 36 + idx * 132;
      this.ops[k] = {
        title: mk(13, P.x + 12, y0, CSS.white),
        src: mk(12, P.x + 12, y0 + 18, CSS.cyan),
        health: mk(12, P.x + P.w - 12, y0 + 18, CSS.green),
        artLabel: mk(10, P.x + 12, y0 + 38, CSS.textDim),
        raaLabel: mk(10, P.x + 12, y0 + 70, CSS.yellow),
        press: mk(10, P.x + 12, y0 + 92, CSS.textDim),
        rec: mk(10, P.x + 12, y0 + 108, CSS.amber),
        y0,
      };
      this.ops[k].health.setOrigin(1, 0);
    });
    const y1 = P.y + 36 + 2 * 132;
    this.ops.intel = {
      title: mk(13, P.x + 12, y1, CSS.amber),
      rc: mk(10, P.x + 12, y1 + 20, CSS.text),
      full: mk(10, P.x + 12, y1 + 40, CSS.textDim),
      blue: mk(10, P.x + 12, y1 + 56, CSS.cyan),
      stacks: mk(10, P.x + 12, y1 + 72, CSS.green),
      util: mk(10, P.x + 12, y1 + 88, CSS.text),
      y1,
    };
  }

  drawOps() {
    const g = this.dyn; const P = LAYOUT.panels.ops;
    ["primary", "secondary"].forEach((k) => {
      const side = this.sim.state.sides[k]; const o = this.ops[k];
      const health = this.sideHealth(side);
      const hcol = health >= 75 ? CSS.green : health >= 45 ? CSS.yellow : CSS.red;
      const raaMax = side.raaStackingLocked ? 1 : this.sim.tune.raaPrepCapacity;
      const full = side.bases.filter((b) => b.fullPallet).length;
      const needs = side.bases.filter((b) => !b.empty && b.blocked && !b.fullPallet).length;
      const srcState = side.refillTimer > 0 ? "REFILL" : side.source;
      g.fillStyle(0x0c161c, 0.6); g.fillRoundedRect(P.x + 6, o.y0 - 4, P.w - 12, 124, 7);
      g.lineStyle(1, 0x2a3b44, 0.6); g.strokeRoundedRect(P.x + 6, o.y0 - 4, P.w - 12, 124, 7);
      o.title.setText(`${side.label.toUpperCase()} DOCK`);
      o.src.setText(srcState).setColor(srcState === "REFILL" ? CSS.yellow : srcState === "RAA" ? CSS.yellow : CSS.cyan);
      o.health.setText(`FLOW ${health}%`).setColor(hcol);
      // ART meter
      this.meter(g, P.x + 12, o.y0 + 52, P.w - 24, side.artBacklog / this.sim.tune.artCapacity, PAL.cyan);
      o.artLabel.setText(`ART ${side.artBacklog}/${this.sim.tune.artCapacity}`);
      // RAA pips
      for (let i = 0; i < raaMax; i++) {
        g.fillStyle(i < side.raaPrep ? (side.raaStackingLocked ? PAL.red : PAL.yellow) : 0x24323a, 1);
        g.fillRoundedRect(P.x + 12 + i * 16, o.y0 + 84, 12, 10, 2);
      }
      o.raaLabel.setText(side.raaStackingLocked ? `RAA ${side.raaPrep}/1 LOCKED` : `RAA ${side.raaPrep}/${raaMax}`)
        .setColor(side.raaStackingLocked ? CSS.red : CSS.yellow);
      o.press.setText(`In ${side.inbound.length}   Full ${full}   Empty ${needs}`);
      o.rec.setText(side.refillTimer > 0 ? `Trailer turn ${formatTime(side.refillTimer)}` : this.recommend(side))
        .setColor(side.refillTimer > 0 ? CSS.yellow : CSS.amber);
    });
    // intel
    const o = this.ops.intel; const st = this.sim.state;
    g.fillStyle(0x0c161c, 0.6); g.fillRoundedRect(P.x + 6, o.y1 - 4, P.w - 12, 110, 7);
    g.lineStyle(1, 0x2a3b44, 0.6); g.strokeRoundedRect(P.x + 6, o.y1 - 4, P.w - 12, 110, 7);
    const rc = this.sim.workers.rc();
    const full = Object.values(st.sides).reduce((a, sd) => a + sd.bases.filter((b) => b.fullPallet).length, 0);
    const blue = Object.values(st.sides).reduce((a, sd) => a + sd.bases.filter((b) => b.fullPallet?.colorKey === "Blue").length, 0);
    const util = Math.round(this.sim.workers.utilization() * 100);
    o.title.setText("COMMAND INTEL");
    o.rc.setText(`RC: ${rc ? rc.status : "none assigned"}`).setColor(rc ? CSS.text : CSS.red);
    o.full.setText(`Full pallets waiting: ${full}`).setColor(full ? CSS.yellow : CSS.green);
    o.blue.setText(`Blue ${blue}   IBT ${st.ibt.count}/${this.sim.tune.ibtCapacity}`).setColor(st.ibt.count >= 8 ? CSS.yellow : CSS.cyan);
    o.stacks.setText(`Empties P${st.emptyStacks.primary.count} S${st.emptyStacks.secondary.count}`)
      .setColor(st.emptyStacks.primary.count <= 2 || st.emptyStacks.secondary.count <= 2 ? CSS.yellow : CSS.green);
    o.util.setText(`Utilization: ${util}%`).setColor(util >= 80 ? CSS.green : CSS.yellow);
  }

  meter(g, x, y, w, ratio, color) {
    g.fillStyle(0x1a242b, 1); g.fillRoundedRect(x, y, w, 9, 4);
    g.fillStyle(color, 0.95); g.fillRoundedRect(x, y, w * clamp(ratio, 0, 1), 9, 4);
  }

  sideHealth(side) {
    const inbound = side.inbound.length;
    const full = side.bases.filter((b) => b.fullPallet).length;
    const needs = side.bases.filter((b) => !b.empty && b.blocked && !b.fullPallet).length;
    const artRisk = side.source === "ART" && side.artBacklog <= 12 ? 18 : side.source === "ART" && side.artBacklog <= 25 ? 8 : 0;
    const raaRisk = side.artBacklog <= 20 && side.raaPrep <= 0 ? 16 : 0;
    const srcRisk = side.source === "ART" && side.artBacklog <= 0 ? 24 : 0;
    return Math.round(clamp(100 - inbound * 3 - full * 12 - needs * 8 - artRisk - raaRisk - srcRisk, 0, 100));
  }

  recommend(side) {
    const full = side.bases.filter((b) => b.fullPallet).length;
    const needs = side.bases.filter((b) => !b.empty && b.blocked && !b.fullPallet).length;
    if (side.source === "ART" && side.artBacklog <= 0 && side.raaPrep > 0) return "Switch to RAA now.";
    if (side.source === "ART" && side.artBacklog <= 0) return "Request trailer / prep RAA.";
    if (side.source === "ART" && side.artBacklog <= 20 && side.raaPrep <= 0) return "Send RC to prep RAA.";
    if (full >= 2) return "RC: full pallets waiting.";
    if (needs >= 2) return "Bases need empties.";
    if (this.sim.state.emptyStacks[side.key].count <= 2) return "Restock empties soon.";
    if (side.inbound.length >= 8) return "Add base labor.";
    return "Stable — watch trailer risk.";
  }

  /* ---------------- Command bar ---------------- */
  buildCommandBar() {
    const s = this.scene; const P = LAYOUT.panels.command;
    const defs = [
      { id: "toggleP", label: "Source P", icon: "truck", key: "Q", color: PAL.cyan, tip: "Toggle Primary source between ART trailer and RAA backup.", onClick: () => this.sim.flow.toggleSource("primary") },
      { id: "toggleS", label: "Source S", icon: "truck", key: "W", color: PAL.purple, tip: "Toggle Secondary source between ART trailer and RAA backup.", onClick: () => this.sim.flow.toggleSource("secondary") },
      { id: "reqP", label: "ART P", icon: "factory", key: "A", color: PAL.cyan, tip: "Request a new Primary ART trailer (only when ART is empty).", onClick: () => this.sim.flow.requestTrailer("primary") },
      { id: "reqS", label: "ART S", icon: "factory", key: "S", color: PAL.purple, tip: "Request a new Secondary ART trailer (only when ART is empty).", onClick: () => this.sim.flow.requestTrailer("secondary") },
      { id: "ibt", label: "Clear IBT", icon: "warehouse", key: "E", color: PAL.blue, tip: "Truck out accumulated blue Transfer pallets from IBT.", onClick: () => this.sim.staging.requestIbt() },
      { id: "rework", label: "Rework", icon: "unpack", key: "R", color: PAL.yellow, tip: "Split the first mixed staging lane into clean color groups (needs open lanes).", onClick: () => this.sim.staging.reworkMixedLane() },
      { id: "gpm", label: "Call GPM", icon: "forklift", key: "G", color: PAL.red, tip: "Emergency: clear ALL staging lanes. Penalized — use sparingly.", onClick: () => this.sim.staging.manualGpm() },
      { id: "help", label: "Glossary", icon: "cog", key: "T", color: PAL.amber, tip: "Open the warehouse terms glossary.", onClick: () => this.scene.openGlossary() },
    ];
    const n = defs.length, gap = 10, bw = 150, total = n * bw + (n - 1) * gap;
    let x = (GAME.W - total) / 2 + bw / 2;
    defs.forEach((d) => { this.buttons[d.id] = new UIButton(s, { x, y: P.y + P.h / 2 - 2, w: bw, h: 34, ...d }); x += bw + gap; });
  }

  drawCommandStates() {
    const st = this.sim.state;
    this.buttons.toggleP.setActive(st.sides.primary.source === "RAA");
    this.buttons.toggleS.setActive(st.sides.secondary.source === "RAA");
    this.buttons.reqP.setEnabled(st.sides.primary.artBacklog <= 0 && st.sides.primary.refillTimer <= 0);
    this.buttons.reqS.setEnabled(st.sides.secondary.artBacklog <= 0 && st.sides.secondary.refillTimer <= 0);
    this.buttons.ibt.setEnabled(st.ibt.count > 0 && !st.ibt.clearing);
    this.buttons.rework.setEnabled(st.staging.lanes.some((l) => l.mixed));
    this.buttons.gpm.setEnabled(st.staging.lanes.some((l) => l.pallets.length > 0));
  }

  /* ---------------- toasts ---------------- */
  drawToasts() {
    // rebuild list cheaply each frame
    this.toastObjs.forEach((t) => { t.bg.destroy(); t.txt.destroy(); });
    this.toastObjs = [];
    const items = this.sim.alerts.items.slice(0, 3);
    items.forEach((a, i) => {
      const col = a.severity === "good" ? CSS.green : a.severity === "warn" ? CSS.yellow : a.severity === "bad" ? CSS.red : CSS.textDim;
      const bar = a.severity === "good" ? PAL.green : a.severity === "warn" ? PAL.yellow : a.severity === "bad" ? PAL.red : PAL.cyan;
      const alpha = clamp(1 - (a.age - 6500) / 2000, 0, 1) * clamp(a.age / 180, 0, 1);
      const y = 70 + i * 24;
      const bg = this.scene.add.graphics().setDepth(D.toast).setAlpha(alpha);
      const txt = this.scene.add.text(232, y + 3, a.text, { fontFamily: FONTS.ui, fontSize: 12, color: col, fontStyle: "500" }).setDepth(D.toast + 1).setAlpha(alpha);
      const w = txt.width + 26;
      glass(bg, 218, y, w, 21, 5, 0x070f14, 0.82, bar, 0.5);
      bg.fillStyle(bar, 0.9); bg.fillRoundedRect(218, y, 3, 21, 2);
      this.toastObjs.push({ bg, txt });
    });
  }

  /* ---------------- score pops ---------------- */
  drainPops() {
    const pops = this.sim.scoring.drain();
    pops.forEach((p) => {
      const big = Math.abs(p.amount) >= 70;
      const x = p.x || 560, y = p.y || 36;
      const col = p.amount > 0 ? CSS.green : CSS.red;
      const t = this.scene.add.text(x, y, `${p.amount > 0 ? "+" : ""}${p.amount}`, {
        fontFamily: FONTS.display, fontSize: big ? 20 : 14, color: col, fontStyle: "700",
      }).setOrigin(0.5).setDepth(D.pop);
      this.scene.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 1100, ease: "Cubic.out", onComplete: () => t.destroy() });
      if (big && p.amount > 0 && this.scene.world) this.scene.world.burst(x, y, "green");
    });
  }

  /* ---------------- keys ---------------- */
  bindKeys() {
    const kb = this.scene.input.keyboard;
    const map = { Q: () => this.sim.flow.toggleSource("primary"), W: () => this.sim.flow.toggleSource("secondary"),
      A: () => this.sim.flow.requestTrailer("primary"), S: () => this.sim.flow.requestTrailer("secondary"),
      E: () => this.sim.staging.requestIbt(), R: () => this.sim.staging.reworkMixedLane(), G: () => this.sim.staging.manualGpm(),
      T: () => this.scene.openGlossary(), M: () => this.scene.toggleMute() };
    Object.entries(map).forEach(([k, fn]) => kb.on(`keydown-${k}`, () => { if (!this.sim.state.paused || k === "M") { fn(); } }));
    for (let i = 1; i <= 6; i++) kb.on(`keydown-${["ONE","TWO","THREE","FOUR","FIVE","SIX"][i-1]}`, () => this.sim.workers.selectById(i));
    kb.on("keydown-SPACE", () => this.scene.togglePause());
  }

  update() {
    this.dyn.clear();
    this.drawHud();
    this.drawRoster();
    this.drawOps();
    this.drawCommandStates();
    this.drawToasts();
    this.drainPops();
    this.soundBtn.label.setText(Sound.isMuted() ? "off" : "on");
  }
}

window.UIManager = UIManager;
window.UIButton = UIButton;
