/* =============================================================================
 * Tutorial — RC OPERATOR edition. Gated, interactive onboarding over a live
 * shift. Teaches hauling, blue/IBT, trailer accept/reject, and crew/RAA.
 * ===========================================================================*/
class Tutorial {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim; this.index = 0; this.done = false; this.timer = 0;
    // shorten the runway so a trailer is offered early enough to teach it
    sim.state.sides.primary.artBacklog = 22;
    sim.state.sides.secondary.artBacklog = 28;

    const fullBaseRect = () => {
      for (const k of ["primary", "secondary"]) {
        const b = sim.state.sides[k].bases.find((x) => x.fullPallet);
        if (b) { const p = basePos(k, b.index); return { x: p.x - 48, y: p.y - 36, w: 96, h: 66 }; }
      }
      return null;
    };
    const panelRect = (P) => ({ x: P.x, y: P.y, w: P.w, h: P.h });

    this.steps = [
      { text: "You are the RC operator — the forklift. Your crew builds pallets on the bases automatically. Watch a base climb toward 6 boxes.",
        target: () => null, check: () => sim.state.sides.primary.bases.some((b) => b.boxes >= 3) || sim.state.sides.secondary.bases.some((b) => b.boxes >= 3) },
      { text: "A base hit 6 — it's a FULL pallet (glowing yellow) and now blocks that base. Click it to haul it to staging.",
        target: fullBaseRect, check: () => sim.state.stats.hauls >= 1 },
      { text: "Nice. Keep bases clear — haul a couple more. Blue 'Transfer' pallets auto-route to IBT instead of staging.",
        target: fullBaseRect, check: () => sim.state.stats.hauls >= 3 },
      { text: "ART is running low. A trailer is offered on the dock panel with its blue %. Read it, then ACCEPT or REJECT it.",
        target: () => panelRect(LAYOUT.panels.roster), check: () => sim.state.stats.trailersAccepted + sim.state.stats.trailersRejected >= 1 },
      { text: "That's the job. Balance the crew with SEND CREW, PREP RAA before a dock dries, and use Ship Partial in a pinch. Finish the shift!",
        target: () => null, check: () => this.timer > 6000 },
    ];
    this.build();
    this.enter();
  }

  build() {
    const s = this.scene;
    this.ring = s.add.graphics().setDepth(1480);
    this.c = s.add.container(GAME.W / 2, 596).setDepth(1500);
    this.bg = s.add.graphics();
    glass(this.bg, -320, -34, 640, 68, 10, 0x07131a, 0.96, PAL.amber, 0.8);
    this.bg.fillStyle(PAL.amber, 0.9); this.bg.fillRoundedRect(-320, -34, 6, 68, 3);
    this.badge = s.add.text(-302, -24, "", { fontFamily: FONTS.ui, fontSize: 11, color: CSS.amber, fontStyle: "700" });
    this.txt = s.add.text(-302, -6, "", { fontFamily: FONTS.ui, fontSize: 13.5, color: CSS.text, wordWrap: { width: 540 }, lineSpacing: 2 });
    this.skip = s.add.text(302, -24, "SKIP ▸", { fontFamily: FONTS.ui, fontSize: 11, color: CSS.muted }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
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
    this.ring.clear();
    const r = step.target && step.target();
    if (r) {
      const pulse = 0.5 + Math.sin(this.scene.now / 220) * 0.4;
      this.ring.lineStyle(3, PAL.amber, 0.4 + pulse * 0.5);
      this.ring.strokeRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 12);
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
    this.done = true; this.ring.clear();
    this.scene.tweens.add({ targets: this.c, alpha: 0, y: 630, duration: 400, onComplete: () => this.c.destroy() });
    const t = this.scene.add.text(GAME.W / 2, GAME.H / 2 - 40, skipped ? "TRAINING SKIPPED" : "TRAINING CORE COMPLETE", { fontFamily: FONTS.display, fontSize: 40, color: CSS.green, fontStyle: "700" }).setOrigin(0.5).setDepth(1500).setAlpha(0);
    const t2 = this.scene.add.text(GAME.W / 2, GAME.H / 2 + 6, "Finish the shift to complete your grade.", { fontFamily: FONTS.ui, fontSize: 16, color: CSS.text }).setOrigin(0.5).setDepth(1500).setAlpha(0);
    this.scene.tweens.add({ targets: [t, t2], alpha: 1, duration: 400, yoyo: true, hold: 1400, onComplete: () => { t.destroy(); t2.destroy(); } });
  }
}
window.Tutorial = Tutorial;
