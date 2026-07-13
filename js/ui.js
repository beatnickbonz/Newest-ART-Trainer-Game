/* =============================================================================
 * UIManager — bright facility edition (rebuild Phase 4). Frosted-light glass,
 * dark slate text, amber primary actions (ART_DIRECTION.md §4). PRIMARY dock
 * controls LEFT, SECONDARY RIGHT (matching the floor). Every control routes to
 * the exact same frozen sim call as before (docs/SIM_CONTRACT.md); keybinds
 * unchanged. All interactive elements carry ≥44px hit areas for tablet.
 * ===========================================================================*/

const D = { panel: 1000, dyn: 1001, text: 1002, btn: 1004, toast: 1060, pop: 1080, tip: 1120 };

/* Legacy dark glass (menus/pause still use it until Phase 6). */
function glass(g, x, y, w, h, r, fill = 0x0a141a, alpha = 0.84, border = PAL.line, ba = 0.8) {
  g.fillStyle(fill, alpha); g.fillRoundedRect(x, y, w, h, r);
  g.fillStyle(0xffffff, 0.04); g.fillRoundedRect(x, y, w, Math.min(18, h), r);
  g.lineStyle(1.5, border, ba); g.strokeRoundedRect(x, y, w, h, r);
}

/* Frosted-light panel for the in-game chrome. */
function frost(g, x, y, w, h, r) {
  const T = window.THEME;
  g.fillStyle(0x334155, 0.14); g.fillRoundedRect(x + 2, y + 4, w, h, r);      // soft drop
  g.fillStyle(T.color.surface[0].hex, 0.93); g.fillRoundedRect(x, y, w, h, r);
  g.fillStyle(0xffffff, 0.55); g.fillRoundedRect(x, y, w, Math.min(16, h), r); // top sheen
  g.lineStyle(1.5, T.color.line.hex, 0.8); g.strokeRoundedRect(x, y, w, h, r);
}

class Tooltip {
  constructor(scene) {
    this.scene = scene;
    this.bg = scene.add.graphics().setDepth(D.tip).setVisible(false);
    this.txt = scene.add.text(0, 0, "", { fontFamily: FONTS.ui, fontSize: 12, color: "#f4f8fa", wordWrap: { width: 220 } }).setDepth(D.tip + 1).setVisible(false);
  }
  show(x, y, text) {
    this.txt.setText(text);
    const w = Math.min(236, this.txt.width + 16), h = this.txt.height + 12;
    let px = clamp(x - w / 2, 6, GAME.W - w - 6);
    let py = y - h - 12; if (py < 6) py = y + 20;
    this.bg.clear(); glass(this.bg, px, py, w, h, 6, 0x0f172a, 0.96, PAL.amber, 0.6);
    this.txt.setPosition(px + 8, py + 6).setWordWrapWidth(w - 16);
    this.bg.setVisible(true); this.txt.setVisible(true);
  }
  hide() { this.bg.setVisible(false); this.txt.setVisible(false); }
}

class UIButton {
  constructor(scene, o) {
    const T = window.THEME;
    this.scene = scene; this.o = o; this.T = T; this.enabled = true; this.active = false; this.hover = false;
    this.c = scene.add.container(o.x, o.y).setDepth(D.btn);
    this.g = scene.add.graphics();
    this.icon = o.icon ? scene.add.image(-o.w / 2 + 15, 0, `ic_${o.icon}`).setDisplaySize(14, 14) : null;
    this.label = scene.add.text(o.icon ? -o.w / 2 + 28 : 0, 0, o.label, { fontFamily: FONTS.ui, fontSize: o.fs || 12, color: T.color.text.body.css, fontStyle: "700" }).setOrigin(o.icon ? 0 : 0.5, 0.5);
    this.keyBadge = o.key ? scene.add.text(o.w / 2 - 9, -o.h / 2 + 8, o.key, { fontFamily: FONTS.ui, fontSize: 9, color: T.color.text.muted.css, fontStyle: "700" }).setOrigin(0.5) : null;
    const kids = [this.g, this.label]; if (this.icon) kids.push(this.icon); if (this.keyBadge) kids.push(this.keyBadge);
    this.c.add(kids);
    // tablet-friendly hit area: at least THEME.touchTarget square regardless of visual size
    const hw = Math.max(o.w, T.touchTarget), hh = Math.max(o.h, T.touchTarget);
    this.c.setInteractive(new Phaser.Geom.Rectangle(-hw / 2, -hh / 2, hw, hh), Phaser.Geom.Rectangle.Contains);
    this.c.on("pointerover", () => { this.hover = true; this.redraw(); Sound.play("hover"); if (o.tip) scene.ui.tooltip.show(o.x, o.y - o.h / 2, o.tip); });
    this.c.on("pointerout", () => { this.hover = false; this.redraw(); scene.ui.tooltip.hide(); });
    this.c.on("pointerdown", () => { if (this.enabled) { Sound.play("click"); o.onClick(); } else Sound.play("deny"); });
    this.redraw();
  }
  setEnabled(v) { if (this.enabled !== v) { this.enabled = v; this.redraw(); } }
  setActive(v) { if (this.active !== v) { this.active = v; this.redraw(); } }
  setLabel(t) { if (this.label.text !== t) this.label.setText(t); }
  redraw() {
    const o = this.o, g = this.g, T = this.T, col = o.color || T.color.steel.hex;
    g.clear();
    const fill = !this.enabled ? 0xe3e8eb : this.active ? col : this.hover ? shadeNum(col, 0.78) : 0xffffff;
    g.fillStyle(fill, this.enabled ? 0.97 : 0.7); g.fillRoundedRect(-o.w / 2, -o.h / 2, o.w, o.h, 6);
    g.lineStyle(1.5, this.enabled ? (this.active || this.hover ? shadeNum(col, -0.25) : T.color.line.hex) : 0xc3ccd1, 1);
    g.strokeRoundedRect(-o.w / 2, -o.h / 2, o.w, o.h, 6);
    if (!this.active) { g.fillStyle(col, this.enabled ? 0.95 : 0.35); g.fillRoundedRect(-o.w / 2, o.h / 2 - 3, o.w, 3, 2); }
    this.label.setColor(!this.enabled ? T.color.text.muted.css : this.active ? "#ffffff" : T.color.text.body.css);
    if (this.keyBadge) this.keyBadge.setColor(this.active ? "#ffffff" : T.color.text.muted.css);
    if (this.icon) this.icon.setTint(!this.enabled ? 0x9fb0ba : this.active ? 0xffffff : shadeNum(col, -0.15));
  }
}

class UIManager {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim; scene.ui = this;
    this.T = window.THEME;
    this.side = {}; this.toastObjs = []; this.btn = {};
  }

  ink() { return this.T.color.text.body.css; }
  dim() { return this.T.color.text.dim.css; }
  muted() { return this.T.color.text.muted.css; }
  st(name) { return this.T.color.state[name].css; }

  build() {
    const s = this.scene;
    this.tooltip = new Tooltip(s);
    this.panelG = s.add.graphics().setDepth(D.panel);
    this.dyn = s.add.graphics().setDepth(D.dyn);
    this.drawPanels();
    this.buildHud();
    this.buildSidePanel("primary", LAYOUT.panels.roster);
    this.buildSidePanel("secondary", LAYOUT.panels.ops);
    this.buildCommandBar();
    this.bindKeys();
  }

  drawPanels() {
    const g = this.panelG, P = LAYOUT.panels;
    frost(g, P.hud.x + 6, P.hud.y + 6, P.hud.w - 12, P.hud.h - 6, 8);
    frost(g, P.roster.x, P.roster.y, P.roster.w, P.roster.h, 10);
    frost(g, P.ops.x, P.ops.y, P.ops.w, P.ops.h, 10);
    frost(g, P.command.x + 6, P.command.y, P.command.w - 12, P.command.h - 6, 8);
  }

  /* ---------------- HUD ---------------- */
  buildHud() {
    const s = this.scene;
    const bg = s.add.graphics().setDepth(D.text);
    bg.fillStyle(this.T.color.brand.hex, 1); bg.fillRoundedRect(16, 14, 34, 34, 7);
    bg.fillStyle(0xffffff, 0.95); [10, 16, 22].forEach((dx, i) => bg.fillRect(16 + dx, 22 + (i % 2 ? 0 : 4), 4, 18 - (i % 2 ? 0 : 4)));
    s.add.text(58, 14, "WAREHOUSE FLOW COMMANDER", { fontFamily: FONTS.display, fontSize: 17, color: this.T.color.text.ink.css, fontStyle: "700" }).setDepth(D.text);
    this.hudScenario = s.add.text(59, 36, "", { fontFamily: FONTS.ui, fontSize: 12, color: this.T.color.brandDeep.css, fontStyle: "700" }).setDepth(D.text);

    this.scoreT = s.add.text(560, 12, "0", { fontFamily: FONTS.display, fontSize: 24, color: this.T.color.text.ink.css, fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);
    s.add.text(560, 42, "SCORE", { fontFamily: FONTS.ui, fontSize: 10, color: this.muted(), fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);
    this.flowT = s.add.text(722, 6, "100%", { fontFamily: FONTS.display, fontSize: 23, color: this.st("good"), fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);
    s.add.text(722, 46, "FLOW HEALTH", { fontFamily: FONTS.ui, fontSize: 10, color: this.muted(), fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);
    this.shiftT = s.add.text(880, 12, "0:00", { fontFamily: FONTS.display, fontSize: 22, color: this.ink(), fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);
    s.add.text(880, 44, "SHIFT", { fontFamily: FONTS.ui, fontSize: 10, color: this.muted(), fontStyle: "700" }).setOrigin(0.5, 0).setDepth(D.text);

    this.objChips = [];
    (this.sim.scenario.objectives || []).slice(0, 2).forEach((o, i) => {
      const x = 896 + i * 150;
      const icon = s.add.image(x + 12, 31, "ic_cog").setDisplaySize(13, 13).setTint(this.T.color.accent.hex).setDepth(D.text);
      const t = s.add.text(x + 24, 16, "", { fontFamily: FONTS.ui, fontSize: 10.5, color: this.dim(), wordWrap: { width: 106 }, lineSpacing: -2, fontStyle: "600" }).setDepth(D.text);
      this.objChips.push({ o, icon, t, x });
    });
    this.pauseBtn = new UIButton(s, { x: 1208, y: 31, w: 40, h: 30, label: "II", color: this.T.color.accent.hex, tip: "Pause (Space)", onClick: () => this.scene.togglePause() });
    this.soundBtn = new UIButton(s, { x: 1252, y: 31, w: 36, h: 30, label: "on", color: this.T.color.brand.hex, tip: "Mute / unmute (M)", onClick: () => this.scene.toggleMute() });
  }

  drawHud() {
    const st = this.sim.state;
    this.hudScenario.setText(`${this.sim.scenario.tag} · ${this.sim.scenario.name.toUpperCase()} · YOU ARE THE RC`);
    this.scoreT.setText(`${st.score}`);
    const h = Math.round(st.flowHealth);
    this.flowT.setText(`${h}%`).setColor(h >= 70 ? this.st("good") : h >= 40 ? this.st("warn") : this.st("bad"));
    this.shiftT.setText(formatTime(st.shiftRemaining));
    const g = this.dyn;
    // flow gauge — the master teaching signal: thick bar + threshold ticks
    const gx = 660, gw = 124, gy = 33;
    g.fillStyle(0xd7dde1, 1); g.fillRoundedRect(gx, gy, gw, 10, 5);
    g.fillStyle(h >= 70 ? this.T.color.state.good.hex : h >= 40 ? this.T.color.state.warn.hex : this.T.color.state.bad.hex, 1);
    g.fillRoundedRect(gx, gy, Math.max(8, gw * (h / 100)), 10, 5);
    g.fillStyle(0xffffff, 0.45); g.fillRoundedRect(gx, gy, Math.max(8, gw * (h / 100)), 4, 2);
    [this.sim.tune.flowCritical, this.sim.tune.flowWarning].forEach((t) => {
      g.fillStyle(0x475569, 0.8); g.fillRect(gx + gw * (t / 100) - 1, gy - 2, 2, 14);
    });
    const sp = 1 - st.shiftRemaining / st.shiftTotal;
    g.fillStyle(0xd7dde1, 1); g.fillRoundedRect(842, 38, 76, 6, 3);
    g.fillStyle(this.T.color.accent.hex, 1); g.fillRoundedRect(842, 38, 76 * sp, 6, 3);
    this.objChips.forEach((c) => {
      const r = this.liveObjective(c.o);
      c.t.setText(c.o.label);
      c.icon.setTint(r.pass ? this.T.color.state.good.hex : r.danger ? this.T.color.state.bad.hex : this.T.color.accent.hex);
      c.t.setColor(r.pass ? this.st("good") : r.danger ? this.st("bad") : this.dim());
      g.lineStyle(1.5, r.pass ? this.T.color.state.good.hex : r.danger ? this.T.color.state.bad.hex : this.T.color.line.hex, 0.7);
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

  /* ---------------- side panels (primary=left, secondary=right) ---------------- */
  buildSidePanel(key, P) {
    const s = this.scene;
    const other = key === "primary" ? "Secondary" : "Primary";
    const accent = key === "primary" ? "#0369a1" : "#6d28d9";
    const mk = (n, x, y, color, ox = 0) => s.add.text(x, y, "", { fontFamily: FONTS.ui, fontSize: n, color, fontStyle: "600" }).setOrigin(ox, 0).setDepth(D.text);
    const ref = { P };
    ref.title = s.add.text(P.x + 14, P.y + 10, `${key.toUpperCase()} DOCK`, { fontFamily: FONTS.display, fontSize: 15, color: accent, fontStyle: "700" }).setDepth(D.text);
    ref.flow = mk(13, P.x + P.w - 14, P.y + 12, this.st("good"), 1);
    ref.src = mk(12, P.x + 14, P.y + 34, "#0369a1");
    ref.toggle = new UIButton(s, { x: P.x + P.w - 50, y: P.y + 42, w: 78, h: 24, label: "→ RAA", fs: 11, color: this.T.color.state.warn.hex, tip: "Toggle this dock between ART trailer and RAA backup.", onClick: () => this.sim.dispatch("toggleSource", { side: key }) });
    ref.artLabel = mk(10, P.x + 14, P.y + 60, this.dim());
    ref.raaLabel = mk(10, P.x + 14, P.y + 92, this.st("warn"));
    ref.prep = new UIButton(s, { x: P.x + P.w - 50, y: P.y + 100, w: 78, h: 24, label: "PREP RAA", fs: 10, color: this.T.color.state.warn.hex, tip: "Send the forklift to pre-build an RAA backup pallet for this dock.", onClick: () => this.sim.dispatch("raaPrep", { side: key }) });
    ref.stats = mk(10, P.x + 14, P.y + 120, this.dim());
    ref.rec = s.add.text(P.x + 14, P.y + 138, "", { fontFamily: FONTS.ui, fontSize: 10.5, color: this.T.color.brandDeep.css, wordWrap: { width: P.w - 28 }, fontStyle: "600" }).setDepth(D.text);
    // trailer
    ref.trHdr = s.add.text(P.x + 14, P.y + 180, "INCOMING TRAILER", { fontFamily: FONTS.ui, fontSize: 11, color: this.T.color.brandDeep.css, fontStyle: "700" }).setDepth(D.text);
    ref.trBlue = s.add.text(P.x + 14, P.y + 196, "", { fontFamily: FONTS.display, fontSize: 22, color: "#0369a1", fontStyle: "700" }).setDepth(D.text);
    ref.trText = mk(10, P.x + 64, P.y + 202, this.dim());
    ref.accept = new UIButton(s, { x: P.x + 52, y: P.y + 246, w: 76, h: 28, label: "ACCEPT", fs: 11, color: this.T.color.state.good.hex, tip: "Dock this trailer. Its freight mix feeds this line until empty.", onClick: () => this.sim.dispatch("acceptTrailer", { side: key }) });
    ref.reject = new UIButton(s, { x: P.x + P.w - 52, y: P.y + 246, w: 76, h: 28, label: "REJECT", fs: 11, color: this.T.color.state.bad.hex, tip: "Send the trailer away (e.g. too much blue). Next offer after a cooldown.", onClick: () => this.sim.dispatch("rejectTrailer", { side: key }) });
    // crew
    ref.crew = s.add.text(P.x + 14, P.y + 286, "", { fontFamily: FONTS.ui, fontSize: 12, color: this.ink(), fontStyle: "700" }).setDepth(D.text);
    ref.reassign = new UIButton(s, { x: P.x + P.w / 2, y: P.y + 318, w: P.w - 36, h: 30,
      label: key === "primary" ? `SEND CREW TO ${other.toUpperCase()} ►` : `◄ SEND CREW TO ${other.toUpperCase()}`,
      fs: 10.5, color: this.T.color.brand.hex, tip: `Move one associate from ${key} to ${other.toLowerCase()} dock.`,
      onClick: () => this.sim.dispatch("reassign", { to: key === "primary" ? "secondary" : "primary" }) });
    this.side[key] = ref;
  }

  drawSidePanel(key) {
    const g = this.dyn, ref = this.side[key], P = ref.P;
    const side = this.sim.state.sides[key];
    const health = this.sideHealth(side);
    ref.flow.setText(`FLOW ${health}%`).setColor(health >= 75 ? this.st("good") : health >= 45 ? this.st("warn") : this.st("bad"));
    const srcState = side.refillTimer > 0 ? `REFILL ${formatTime(side.refillTimer)}` : `SOURCE: ${side.source}`;
    ref.src.setText(srcState).setColor(side.refillTimer > 0 ? this.st("warn") : side.source === "RAA" ? this.st("warn") : "#0369a1");
    ref.toggle.setLabel(side.source === "ART" ? "→ RAA" : "→ ART");
    // ART meter
    this.meter(g, P.x + 14, P.y + 74, P.w - 28, side.artBacklog / this.sim.tune.artCapacity, this.T.color.accent.hex);
    ref.artLabel.setText(`ART ${side.artBacklog}/${this.sim.tune.artCapacity}`);
    // RAA pips
    const raaMax = side.raaStackingLocked ? 1 : this.sim.tune.raaPrepCapacity;
    for (let i = 0; i < raaMax; i++) { g.fillStyle(i < side.raaPrep ? (side.raaStackingLocked ? this.T.color.state.bad.hex : this.T.color.state.warn.hex) : 0xd7dde1, 1); g.fillRoundedRect(P.x + 14 + i * 15, P.y + 104, 11, 10, 2); }
    ref.raaLabel.setText(side.raaStackingLocked ? `RAA ${side.raaPrep}/1 LOCK` : `RAA ${side.raaPrep}/${raaMax}`).setColor(side.raaStackingLocked ? this.st("bad") : this.st("warn"));
    ref.prep.setEnabled(side.raaPrep < raaMax && this.sim.rc.queueRoom());
    // stats
    const full = side.bases.filter((b) => b.fullPallet).length;
    const need = side.bases.filter((b) => !b.empty && b.blocked && !b.fullPallet).length;
    ref.stats.setText(`Line ${side.line.length}/${this.sim.tune.lineCap}   Full ${full}   Need ${need}`)
      .setColor(side.line.length >= this.sim.tune.lineCap - 1 ? this.st("bad") : this.dim());
    ref.rec.setText(this.recommend(side));
    // trailer offer — blue% is the dominant read
    const off = side.trailerOffer;
    if (off) {
      ref.trBlue.setText(`${off.bluePct}%`).setColor(off.bad ? this.st("bad") : "#0369a1").setVisible(true);
      ref.trText.setText(`BLUE / IBT${off.bad ? "\n(heavy!)" : ""}`).setColor(off.bad ? this.st("bad") : this.dim());
      this.manifestBar(g, P.x + 14, P.y + 222, P.w - 28, off);
      ref.accept.c.setVisible(true); ref.reject.c.setVisible(true);
      ref.accept.setEnabled(true); ref.reject.setEnabled(true);
    } else {
      ref.trBlue.setVisible(false);
      ref.trText.setText(side.offerCooldown > 0 ? `Next trailer in ${formatTime(side.offerCooldown)}` : side.refillTimer > 0 ? "Trailer docking…" : "No trailer waiting.").setColor(this.muted()).setPosition(P.x + 14, P.y + 200);
      ref.accept.c.setVisible(false); ref.reject.c.setVisible(false);
    }
    if (off) ref.trText.setPosition(P.x + 64, P.y + 202);
    // crew
    const n = this.sim.workers.countOnSide(key);
    ref.crew.setText(`CREW: ${n}`).setColor(n <= 1 ? this.st("warn") : this.ink());
    ref.reassign.setEnabled(this.sim.workers.countOnSide(key) > 1);
  }

  manifestBar(g, x, y, w, off) {
    let cx = x;
    off.mix.forEach((f) => {
      const seg = (f.weight / 100) * w;
      g.fillStyle(f.color, 0.95); g.fillRect(cx, y, Math.max(1, seg), 12); cx += seg;
    });
    g.lineStyle(1, 0x475569, 0.9); g.strokeRect(x, y, w, 12);
    if (off.bad) { g.lineStyle(2, this.T.color.state.bad.hex, 0.9); g.strokeRect(x - 1, y - 1, w + 2, 14); }
  }

  meter(g, x, y, w, ratio, color) {
    g.fillStyle(0xd7dde1, 1); g.fillRoundedRect(x, y, w, 9, 4);
    g.fillStyle(color, 1); g.fillRoundedRect(x, y, w * clamp(ratio, 0, 1), 9, 4);
  }

  sideHealth(side) {
    const full = side.bases.filter((b) => b.fullPallet).length;
    const need = side.bases.filter((b) => !b.empty && b.blocked && !b.fullPallet).length;
    const artRisk = side.source === "ART" && side.artBacklog <= 12 ? 16 : side.source === "ART" && side.artBacklog <= 25 ? 8 : 0;
    const srcRisk = side.source === "ART" && side.artBacklog <= 0 ? 22 : 0;
    return Math.round(clamp(100 - side.line.length * 4 - full * 11 - need * 8 - artRisk - srcRisk, 0, 100));
  }

  recommend(side) {
    const full = side.bases.filter((b) => b.fullPallet).length;
    const need = side.bases.filter((b) => !b.empty && b.blocked && !b.fullPallet).length;
    if (side.trailerOffer) return side.trailerOffer.bad ? "Heavy-blue trailer — reject?" : "Trailer waiting — accept it.";
    if (side.source === "ART" && side.artBacklog <= 0 && side.raaPrep > 0) return "ART dry — switch to RAA.";
    if (side.source === "ART" && side.artBacklog <= 0) return "ART dry — prep RAA fast.";
    if (full >= 2) return "Full pallets piling — haul them.";
    if (side.line.length >= this.sim.tune.lineCap - 2) return "Line jammed — send crew here.";
    if (this.sim.state.emptyStacks[side.key].count <= 2) return "Empties low — restock.";
    if (side.source === "ART" && side.artBacklog <= 20 && side.raaPrep <= 0) return "Pre-build RAA backup.";
    return "Stable — keep hauling.";
  }

  /* ---------------- command bar ---------------- */
  buildCommandBar() {
    const s = this.scene; const P = LAYOUT.panels.command;
    this.rcStatus = s.add.text(20, P.y + 12, "", { fontFamily: FONTS.ui, fontSize: 13, color: this.ink(), fontStyle: "700" }).setDepth(D.text);
    this.intel = s.add.text(20, P.y + 32, "", { fontFamily: FONTS.ui, fontSize: 11, color: this.muted(), fontStyle: "600" }).setDepth(D.text);
    const defs = [
      { id: "ibt", label: "Clear IBT", icon: "warehouse", key: "E", color: PAL.blue, tip: "Truck out accumulated blue pallets from IBT.", onClick: () => this.sim.dispatch("clearIbt") },
      { id: "rework", label: "Rework", icon: "unpack", key: "R", color: this.T.color.state.warn.hex, tip: "Split the first mixed staging lane into clean groups.", onClick: () => this.sim.dispatch("rework") },
      { id: "gpm", label: "Call GPM", icon: "forklift", key: "G", color: this.T.color.state.bad.hex, tip: "Emergency: clear ALL staging lanes. Penalized.", onClick: () => this.sim.dispatch("manualGpm") },
      { id: "restock", label: "Restock", icon: "handtruck", key: "C", color: PAL.brown, tip: "Drive the forklift to refill both empty-pallet stacks.", onClick: () => this.sim.dispatch("restock") },
      { id: "partial", label: "Ship Partial", icon: "box", key: "V", color: 0xea580c, tip: "Arm partial-ship, then click a part-built base to ship it early (penalized).", onClick: () => this.togglePartial() },
      { id: "help", label: "Glossary", icon: "cog", key: "T", color: this.T.color.brand.hex, tip: "Open the warehouse terms glossary.", onClick: () => this.scene.openGlossary() },
    ];
    const n = defs.length, gap = 10, bw = 138, total = n * bw + (n - 1) * gap;
    let x = GAME.W - total - 18 + bw / 2;
    defs.forEach((d) => { this.btn[d.id] = new UIButton(s, { x, y: P.y + P.h / 2 - 2, w: bw, h: 36, ...d }); x += bw + gap; });
  }
  togglePartial() { const armed = this.sim.dispatch("togglePartial"); Sound.play(armed ? "select" : "click"); }

  drawCommand() {
    const st = this.sim.state, rc = st.rc;
    this.rcStatus.setText(`RC OPERATOR — ${rc.status}${rc.queue.length ? `  (+${rc.queue.length} queued)` : ""}`)
      .setColor(rc.job ? "#0369a1" : this.muted());
    const full = Object.values(st.sides).reduce((a, sd) => a + sd.bases.filter((b) => b.fullPallet).length, 0);
    this.intel.setText(`Full pallets: ${full}   ·   IBT ${st.ibt.count}/${this.sim.tune.ibtCapacity}${st.ibt.clearing ? " (clearing)" : ""}   ·   Empties P${st.emptyStacks.primary.count}/S${st.emptyStacks.secondary.count}   ·   Util ${Math.round(this.sim.workers.utilization() * 100)}%`);
    this.btn.ibt.setEnabled(st.ibt.count > 0 && !st.ibt.clearing);
    this.btn.rework.setEnabled(st.staging.lanes.some((l) => l.mixed));
    this.btn.gpm.setEnabled(st.staging.lanes.some((l) => l.pallets.length > 0));
    this.btn.restock.setEnabled((st.emptyStacks.primary.count < this.sim.tune.emptyStackCapacity || st.emptyStacks.secondary.count < this.sim.tune.emptyStackCapacity) && this.sim.rc.queueRoom());
    this.btn.partial.setActive(st.partialArmed);
  }

  /* ---------------- toasts + pops ---------------- */
  drawToasts() {
    this.toastObjs.forEach((t) => { t.bg.destroy(); t.txt.destroy(); });
    this.toastObjs = [];
    this.sim.alerts.items.slice(0, 3).forEach((a, i) => {
      const col = a.severity === "good" ? this.st("good") : a.severity === "warn" ? "#92600a" : a.severity === "bad" ? this.st("bad") : this.dim();
      const bar = a.severity === "good" ? this.T.color.state.good.hex : a.severity === "warn" ? this.T.color.state.warn.hex : a.severity === "bad" ? this.T.color.state.bad.hex : this.T.color.accent.hex;
      const alpha = clamp(1 - (a.age - 6500) / 2000, 0, 1) * clamp(a.age / 180, 0, 1);
      const y = 70 + i * 24;
      const bg = this.scene.add.graphics().setDepth(D.toast).setAlpha(alpha);
      const txt = this.scene.add.text(232, y + 3, a.text, { fontFamily: FONTS.ui, fontSize: 12, color: col, fontStyle: "700" }).setDepth(D.toast + 1).setAlpha(alpha);
      const w = txt.width + 26;
      bg.fillStyle(0x334155, 0.16); bg.fillRoundedRect(220, y + 3, w, 21, 5);
      bg.fillStyle(0xffffff, 0.95); bg.fillRoundedRect(218, y, w, 21, 5);
      bg.lineStyle(1, this.T.color.line.hex, 0.8); bg.strokeRoundedRect(218, y, w, 21, 5);
      bg.fillStyle(bar, 1); bg.fillRoundedRect(218, y, 3, 21, 2);
      this.toastObjs.push({ bg, txt });
    });
  }

  drainPops() {
    this.sim.scoring.drain().forEach((p) => {
      const big = Math.abs(p.amount) >= 70;
      const x = p.x || 560, y = p.y || 36;
      const t = this.scene.add.text(x, y, `${p.amount > 0 ? "+" : ""}${p.amount}`, { fontFamily: FONTS.display, fontSize: big ? 20 : 14, color: p.amount > 0 ? this.st("good") : this.st("bad"), fontStyle: "700" })
        .setOrigin(0.5).setDepth(D.pop).setStroke("#f6f8f9", 4);
      this.scene.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 1100, ease: "Cubic.out", onComplete: () => t.destroy() });
      if (big && p.amount > 0 && this.scene.world) this.scene.world.burst(x, y, "green");
    });
  }

  /* ---------------- keys ---------------- */
  bindKeys() {
    const kb = this.scene.input.keyboard;
    const map = {
      Q: () => this.sim.dispatch("toggleSource", { side: "primary" }), W: () => this.sim.dispatch("toggleSource", { side: "secondary" }),
      Z: () => this.sim.dispatch("raaPrep", { side: "primary" }), X: () => this.sim.dispatch("raaPrep", { side: "secondary" }),
      E: () => this.sim.dispatch("clearIbt"), R: () => this.sim.dispatch("rework"), G: () => this.sim.dispatch("manualGpm"),
      C: () => this.sim.dispatch("restock"), V: () => this.togglePartial(), T: () => this.scene.openGlossary(), M: () => this.scene.toggleMute(),
      ONE: () => this.sim.dispatch("acceptTrailer", { side: "primary" }), TWO: () => this.sim.dispatch("rejectTrailer", { side: "primary" }),
      THREE: () => this.sim.dispatch("acceptTrailer", { side: "secondary" }), FOUR: () => this.sim.dispatch("rejectTrailer", { side: "secondary" }),
    };
    Object.entries(map).forEach(([k, fn]) => kb.on(`keydown-${k}`, () => { if (!this.sim.state.paused || k === "M") fn(); }));
    kb.on("keydown-SPACE", () => this.scene.togglePause());
  }

  update() {
    this.dyn.clear();
    this.drawHud();
    this.drawSidePanel("primary");
    this.drawSidePanel("secondary");
    this.drawCommand();
    this.drawToasts();
    this.drainPops();
    this.soundBtn.setLabel(Sound.isMuted() ? "off" : "on");
  }
}

window.UIManager = UIManager;
window.UIButton = UIButton;
