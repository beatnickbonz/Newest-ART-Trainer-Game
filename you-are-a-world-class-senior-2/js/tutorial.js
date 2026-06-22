/* =============================================================================
 * Tutorial: gated, interactive onboarding overlaid on a live shift.
 * ===========================================================================*/
class Tutorial {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim; this.index = 0; this.done = false;
    this.raaSeen = false;
    this.steps = [
      { text: "Welcome, commander. Select an associate from the TEAM roster on the left — click a card or press 1.", target: { x: 108, y: 300 },
        check: () => !!sim.workers.selected },
      { text: "Now click the PRIMARY DOCK to post them there. Posted workers process inbound freight into pallets.", target: "primary",
        check: () => sim.workers.workers.some((w) => w.assignment === "primary") },
      { text: "Good. Post a second associate to the SECONDARY DOCK so both lines keep moving.", target: "secondary",
        check: () => sim.workers.workers.some((w) => w.assignment === "secondary") },
      { text: "Every floor needs one RC operator. Select a worker, then click SHARED STAGING to put them on the forklift.", target: "staging",
        check: () => !!sim.workers.rc() },
      { text: "Watch the bases fill. When one hits 6 boxes it becomes a full pallet — the RC hauls it to a staging lane automatically.", target: "staging",
        check: () => sim.state.staging.lanes.some((l) => l.pallets.length > 0) },
      { text: "Backup matters. Select the RC and click P · RAA PREP to pre-build a reserve pallet for when ART runs dry.", target: "raaPrimary",
        check: () => { if (sim.state.sides.primary.raaPrep > 0) this.raaSeen = true; return this.raaSeen; } },
      { text: "You've got it. Use Source P/S (Q/W) to switch a dock to RAA, Request ART when empty, and keep flow green. Finish the shift!", target: null,
        check: () => this.timer > 5000 },
    ];
    this.timer = 0;
    this.build();
    this.enter();
  }

  build() {
    const s = this.scene;
    this.ring = s.add.graphics().setDepth(1480);
    this.c = s.add.container(GAME.W / 2, 596).setDepth(1500);
    this.bg = s.add.graphics();
    glass(this.bg, -300, -34, 600, 68, 10, 0x07131a, 0.96, PAL.amber, 0.8);
    this.bg.fillStyle(PAL.amber, 0.9); this.bg.fillRoundedRect(-300, -34, 6, 68, 3);
    this.badge = s.add.text(-282, -24, "", { fontFamily: FONTS.ui, fontSize: 11, color: CSS.amber, fontStyle: "700" });
    this.txt = s.add.text(-282, -6, "", { fontFamily: FONTS.ui, fontSize: 13.5, color: CSS.text, wordWrap: { width: 500 }, lineSpacing: 2 });
    this.skip = s.add.text(282, -24, "SKIP ▸", { fontFamily: FONTS.ui, fontSize: 11, color: CSS.muted }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.skip.on("pointerdown", () => this.finish(true));
    this.skip.on("pointerover", () => this.skip.setColor(CSS.amber));
    this.skip.on("pointerout", () => this.skip.setColor(CSS.muted));
    this.c.add([this.bg, this.badge, this.txt, this.skip]);
  }

  enter() {
    const step = this.steps[this.index];
    this.badge.setText(`TRAINING · STEP ${this.index + 1}/${this.steps.length}`);
    this.txt.setText(step.text);
    this.timer = 0;
  }

  update() {
    if (this.done) return;
    this.timer += this.scene.game.loop.delta;
    const step = this.steps[this.index];
    // highlight target
    this.ring.clear();
    if (step.target) {
      let tx, ty, tw = 60, th = 60;
      if (typeof step.target === "string") { const z = zoneOf(step.target); tx = z.x; ty = z.y; tw = z.w; th = z.h; }
      else { tx = step.target.x; ty = step.target.y; tw = 180; th = 460; }
      const pulse = 0.5 + Math.sin(this.scene.now / 220) * 0.4;
      this.ring.lineStyle(3, PAL.amber, 0.4 + pulse * 0.5);
      this.ring.strokeRoundedRect(tx - tw / 2 - 4, ty - th / 2 - 4, tw + 8, th + 8, 12);
    }
    if (step.check()) this.advance();
  }

  advance() {
    Sound.play("laneComplete");
    this.index += 1;
    if (this.index >= this.steps.length) this.finish(false);
    else this.enter();
  }

  finish(skipped) {
    this.done = true;
    this.ring.clear();
    this.scene.tweens.add({ targets: this.c, alpha: 0, y: 630, duration: 400, onComplete: () => this.c.destroy() });
    const t = this.scene.add.text(GAME.W / 2, GAME.H / 2 - 40, skipped ? "TRAINING SKIPPED" : "TRAINING CORE COMPLETE", { fontFamily: FONTS.display, fontSize: 40, color: CSS.green, fontStyle: "700" }).setOrigin(0.5).setDepth(1500).setAlpha(0);
    const t2 = this.scene.add.text(GAME.W / 2, GAME.H / 2 + 6, "Finish the shift to complete your grade.", { fontFamily: FONTS.ui, fontSize: 16, color: CSS.text }).setOrigin(0.5).setDepth(1500).setAlpha(0);
    this.scene.tweens.add({ targets: [t, t2], alpha: 1, duration: 400, yoyo: true, hold: 1400, onComplete: () => { t.destroy(); t2.destroy(); } });
  }
}
window.Tutorial = Tutorial;
