/* =============================================================================
 * WorldRenderer — bright modern facility edition (rebuild Phase 2).
 *
 * Painted atlases (assets/painted*Data.js) + procedural light/shadow on top.
 * Screen space = sim space (identity projection, see this.project) — the sim's
 * coordinates are FROZEN (docs/SIM_CONTRACT.md); only presentation lives here.
 * External surface kept from the old renderer: constructor(scene, sim, opts),
 * update(delta, now), burst/spawnSparkle, destroy; input routes unchanged to
 * scene.onBaseClick(base) / scene.onZoneClick(assignment).
 * ===========================================================================*/

function shadeNum(color, amt) {
  let r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

const WEATHER_TINT = {
  day: { color: 0x000000, alpha: 0 },
  dawn: { color: 0xf59e42, alpha: 0.07 },
  dusk: { color: 0xb45cf5, alpha: 0.08 },
  night: { color: 0x0b1a3a, alpha: 0.16 },
};

class WorldRenderer {
  constructor(scene, sim, opts = {}) {
    this.scene = scene;
    this.sim = sim;
    this.weather = opts.weather || "day";
    this.T = window.THEME;
    this.now = 0;
    this.fx = [];
    this.workerSprites = [];
    this.doorSprites = {};
    this.baseSprites = { primary: [], secondary: [] };
    this.baseGlows = { primary: [], secondary: [] };
    this.laneSprites = [];
    this.lineSprites = { primary: [], secondary: [] };
    this.emptySprites = { primary: [], secondary: [] };
    this.raaSprites = { primary: [], secondary: [] };
    this.ibtSprites = [];
    this.texts = { bases: { primary: [], secondary: [] }, lanes: [], misc: {} };
    this.build();
  }

  /* Sim-space -> screen-space. Identity today; the single seam for any future
   * camera treatment. Never move the sim's logical positions instead. */
  project(x, y) { return { x, y }; }

  build() {
    this.buildFloor();
    this.buildWall();
    this.buildDressing();
    this.buildConveyors();
    this.buildZones();
    this.buildLights();
    this.dynBack = this.scene.add.graphics().setDepth(150);
    this.dynFront = this.scene.add.graphics().setDepth(640);
    this.hi = this.scene.add.graphics().setDepth(9);
    this.buildTextPools();
    this.buildBaseSprites();
    this.buildLaneSprites();
    this.buildLineSprites();
    this.buildSupportSprites();
    this.createWorkerSprites();
    this.createRc();
    this.buildOverlays();
    this.buildInput();
  }

  /* ---------------- environment ---------------- */
  buildFloor() {
    const s = this.scene;
    s.add.image(0, 0, "p_floor").setOrigin(0).setDisplaySize(GAME.W, GAME.H).setDepth(0);
    const g = s.add.graphics().setDepth(2);
    // keep-clear hatching in front of staging
    const st = zoneOf("staging");
    this.hazardBand(g, st.x - st.w / 2 - 14, st.y + st.h / 2 + 4, st.w + 28, 12);
  }
  hazardBand(g, x, y, w, h) {
    g.fillStyle(this.T.color.brand.hex, 0.08); g.fillRect(x, y, w, h);
    for (let sx = x - h; sx < x + w; sx += 18) { g.lineStyle(5, this.T.color.brand.hex, 0.28); g.lineBetween(sx, y + h, sx + h, y); }
  }

  buildWall() {
    const s = this.scene;
    const wy = LAYOUT.dockWall.y, wh = LAYOUT.dockWall.h, base = wy + wh;
    const g = s.add.graphics().setDepth(84);
    // white insulated panels
    g.fillStyle(this.T.color.surface[1].hex, 1); g.fillRect(0, wy, GAME.W, wh);
    g.lineStyle(1.5, this.T.color.surface[3].hex, 0.8);
    for (let x = 32; x < GAME.W; x += 64) g.lineBetween(x, wy + 4, x, base - 8);
    g.fillStyle(this.T.color.surface[4].hex, 1); g.fillRect(0, wy, GAME.W, 5);          // cornice
    g.fillStyle(this.T.color.steel.hex, 0.9); g.fillRect(0, base - 7, GAME.W, 7);       // kick plate
    g.fillStyle(0x334155, 0.28); g.fillRect(0, base, GAME.W, 5);                        // wall AO on floor
    // galvanized columns
    [120, 520, 770, 1150].forEach((x) => {
      g.fillStyle(this.T.color.steel.hex, 1); g.fillRect(x - 7, wy, 14, wh);
      g.fillStyle(this.T.color.surface[0].hex, 0.35); g.fillRect(x - 7, wy, 4, wh);
    });
    // dock door units (painted, state-driven frames)
    Object.entries(LAYOUT.doors).forEach(([group, list]) => list.forEach((d, i) => {
      const spr = s.add.sprite(d.x, base + 6, "p_dock_doors", DOOR_F.closed)
        .setOrigin(0.5, 1).setScale(PAINTED_SCALE.door).setDepth(88);
      const glow = s.add.circle(d.x, base + 6 - spr.displayHeight * 0.9, 4, PAL.green, 1)
        .setDepth(89).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.doorSprites[`${group}${i}`] = { spr, glow, group, index: i, roll: 0 };
    }));
    this.buildSign(GAME.W / 2, wy + 8, "RECEIVE DOCK · INBOUND");
  }
  buildSign(x, y, label) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(120);
    g.fillStyle(this.T.color.surface[0].hex, 0.96); g.fillRoundedRect(x - 150, y - 2, 300, 26, 6);
    g.lineStyle(1.5, this.T.color.line.hex, 0.9); g.strokeRoundedRect(x - 150, y - 2, 300, 26, 6);
    g.fillStyle(this.T.color.brand.hex, 1); g.fillRoundedRect(x - 150, y - 2, 5, 26, 2);
    s.add.text(x, y + 11, label, { fontFamily: FONTS.ui, fontSize: 13, color: this.T.color.text.body.css, fontStyle: "700" })
      .setOrigin(0.5).setDepth(121);
  }

  buildDressing() {
    const s = this.scene;
    const base = LAYOUT.dockWall.y + LAYOUT.dockWall.h;
    const add = (frame, x, y, scale, depth) =>
      s.add.sprite(x, y, "p_dressing", frame).setOrigin(0.5, 1).setScale(scale).setDepth(depth);
    add(DRESSING_F.rack, 58, base + 4, 0.46, 86);          // rack bays flanking the doors
    add(DRESSING_F.rack, 1222, base + 4, 0.46, 86);
    add(DRESSING_F.charger, 145, 660, 0.3, 660);           // charging station, bottom-left floor
    add(DRESSING_F.cone, 540, 585, 0.22, 585);             // cones at the staging hatch ends
    add(DRESSING_F.cone, 740, 585, 0.22, 585);
    // wall-mounted emergency strips (door gaps) — lit by the flow-critical grade
    this.critStrips = [502, 782].map((x) => ({
      spr: s.add.sprite(x, LAYOUT.dockWall.y + 22, "p_dressing", DRESSING_F.strip).setScale(0.4).setDepth(90).setAlpha(0.1),
      glow: s.add.circle(x, LAYOUT.dockWall.y + 22, 30, 0xff2244).setBlendMode(Phaser.BlendModes.ADD).setDepth(90).setAlpha(0),
    }));
  }

  buildConveyors() {
    // vertical roller belts dropping from each ART door to the dock work area
    const s = this.scene;
    const wallBase = LAYOUT.dockWall.y + LAYOUT.dockWall.h;
    ["primary", "secondary"].forEach((k) => {
      const beltX = lineSlotPos(k, 0).x; // belt centerline (pick point is offset into the corridor)
      const g = s.add.graphics().setDepth(6);
      const bw = 28, bx = beltX - bw / 2, by = wallBase + 2, bh = 613 - by;
      g.fillStyle(0x334155, 0.18); g.fillRoundedRect(bx + 3, by + 4, bw, bh, 5);        // soft shadow
      g.fillStyle(this.T.color.surface[3].hex, 1); g.fillRoundedRect(bx, by, bw, bh, 5);
      g.lineStyle(1.5, this.T.color.steel.hex, 0.9); g.strokeRoundedRect(bx, by, bw, bh, 5);
      g.lineStyle(2, this.T.color.surface[4].hex, 1);
      for (let cy = by + 8; cy < by + bh - 6; cy += 8) g.lineBetween(bx + 3, cy, bx + bw - 3, cy);
      g.fillStyle(this.T.color.brand.hex, 0.95);                                        // guard tips
      g.fillRoundedRect(bx - 2, by - 4, bw + 4, 6, 2); g.fillRoundedRect(bx - 2, by + bh - 2, bw + 4, 6, 2);
    });
  }

  buildZones() {
    const s = this.scene;
    this.zoneGfx = {};
    ZONES.forEach((z) => {
      const g = s.add.graphics().setDepth(8);
      g.fillStyle(z.color, 0.05); g.fillRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10);
      g.lineStyle(3, z.color, z.noWorkerAssignment ? 0.55 : 0.65); g.strokeRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10);
      if (!z.chipless) { // dock strips skip the chip — the side panels carry their names
        const tabW = Math.min(z.w - 16, z.label.length * 7.5 + 34);
        g.fillStyle(z.color, 0.92); g.fillRoundedRect(z.x - z.w / 2 + 8, z.y + z.h / 2 - 26, tabW, 20, 5);
        s.add.image(z.x - z.w / 2 + 20, z.y + z.h / 2 - 16, `ic_${z.icon}`).setDisplaySize(13, 13).setTint(0xffffff).setDepth(9);
        s.add.text(z.x - z.w / 2 + 31, z.y + z.h / 2 - 16, z.label, { fontFamily: FONTS.ui, fontSize: 11, color: "#ffffff", fontStyle: "700" })
          .setOrigin(0, 0.5).setDepth(9);
      }
      this.zoneGfx[z.assignment] = { hover: false, glow: 0 };
    });
  }

  buildLights() {
    // subtle warm skylight pools guiding the eye to work zones
    const pts = [[352, 250], [640, 230], [928, 250], [490, 560], [790, 560], [640, 470]];
    this.lights = pts.map(([x, y]) =>
      this.scene.add.image(x, y, "fx_light").setDepth(60).setBlendMode(Phaser.BlendModes.ADD).setScale(2.1).setAlpha(0.12));
  }

  buildTextPools() {
    const s = this.scene;
    const ink = this.T.color.text.body.css;
    const mk = (size, color) => s.add.text(0, 0, "", { fontFamily: FONTS.ui, fontSize: size, color, fontStyle: "700" })
      .setOrigin(0.5).setDepth(220).setStroke(this.T.color.surface[0].css, 3);
    ["primary", "secondary"].forEach((k) => { for (let i = 0; i < this.sim.tune.baseCount; i++) this.texts.bases[k].push(mk(10, ink)); });
    for (let i = 0; i < this.sim.tune.stagingLanes; i++) this.texts.lanes.push({ tag: mk(11, ink), status: mk(10, ink) });
    this.texts.misc.primaryStack = mk(12, ink);
    this.texts.misc.secondaryStack = mk(12, ink);
    this.texts.misc.ibt = mk(12, this.T.color.state.info.css);
    this.texts.misc.emptyTrailer = mk(10, this.T.color.brandDeep.css);
    this.texts.misc.raaPrimary = mk(10, this.T.color.state.warn.css);
    this.texts.misc.raaSecondary = mk(10, this.T.color.state.warn.css);
    ["primary", "secondary"].forEach((k) => { this.texts.misc[`${k}_line`] = mk(11, this.T.color.state.info.css); });
  }

  /* ---------------- sprite pools ---------------- */
  buildBaseSprites() {
    const s = this.scene;
    ["primary", "secondary"].forEach((k) => {
      this.sim.state.sides[k].bases.forEach((base, i) => {
        const p = this.project(...Object.values(basePos(k, i)));
        const glow = s.add.image(p.x, p.y + 8, "fx_glow_amber").setDepth(p.y + 19)
          .setBlendMode(Phaser.BlendModes.ADD).setScale(1.15).setAlpha(0);
        const spr = s.add.sprite(p.x, p.y + 22, "p_pallets", PALLET_F.empty)
          .setOrigin(0.5, 1).setScale(PAINTED_SCALE.pallets).setDepth(p.y + 20);
        this.baseSprites[k].push(spr);
        this.baseGlows[k].push(glow);
      });
    });
  }

  buildLaneSprites() {
    const s = this.scene;
    for (let i = 0; i < this.sim.tune.stagingLanes; i++) {
      const p = lanePos(i, this.sim.tune.stagingLanes);
      const slots = [];
      for (let n = 0; n < this.sim.tune.stagingCapacity; n++) {
        const sy = p.y + 64 - n * 44;
        slots.push(s.add.sprite(p.x, sy, "p_pallets", PALLET_F.full)
          .setOrigin(0.5, 1).setScale(PAINTED_SCALE.lanePallet).setDepth(sy).setVisible(false));
      }
      this.laneSprites.push(slots);
    }
  }

  buildLineSprites() {
    const s = this.scene;
    ["primary", "secondary"].forEach((k) => {
      for (let i = 0; i < LINE_VISIBLE; i++) {
        const p = lineSlotPos(k, i);
        const box = s.add.sprite(p.x, p.y + 10, "p_cartons", 1)
          .setOrigin(0.5, 1).setScale(PAINTED_SCALE.carton).setDepth(p.y + 10).setVisible(false);
        const band = s.add.sprite(p.x, p.y + 10, "p_carton_bands", 1)
          .setOrigin(0.5, 1).setScale(PAINTED_SCALE.carton).setDepth(p.y + 10.1).setVisible(false);
        this.lineSprites[k].push({ box, band });
      }
    });
  }

  buildSupportSprites() {
    const s = this.scene;
    ["primary", "secondary"].forEach((k) => {
      const z = zoneOf(`${k}Stack`);
      for (let n = 0; n < this.sim.tune.emptyStackCapacity; n++) {
        this.emptySprites[k].push(s.add.sprite(z.x, z.y + 18 - n * 6, "p_pallets", PALLET_F.empty)
          .setOrigin(0.5, 1).setScale(PAINTED_SCALE.empties).setDepth(z.y + 18).setVisible(false));
      }
      const rz = zoneOf(`raa${cap1(k)}`);
      for (let n = 0; n < this.sim.tune.raaPrepCapacity; n++) {
        this.raaSprites[k].push(s.add.sprite(rz.x - 34 + n * 24, rz.y + 22, "p_pallets", PALLET_F.l2)
          .setOrigin(0.5, 1).setScale(0.15).setDepth(rz.y + 22).setVisible(false));
      }
    });
    const z = zoneOf("ibt");
    for (let n = 0; n < this.sim.tune.ibtCapacity; n++) {
      this.ibtSprites.push(s.add.sprite(z.x - 22 + (n % 5) * 11, z.y + 22 - Math.floor(n / 5) * 12, "p_pallets", PALLET_F.full)
        .setOrigin(0.5, 1).setScale(0.13).setDepth(z.y + 22).setVisible(false).setTint(shadeNum(PAL.blue, 0.35)));
    }
  }

  createWorkerSprites() {
    const s = this.scene;
    this.sim.workers.workers.forEach((w) => {
      const key = WORKER_KEYS[(w.id - 1) % WORKER_KEYS.length];
      const shadow = s.add.image(w.x, w.y + 40, "fx_shadow").setDepth(10).setScale(0.55, 0.34).setAlpha(0.32);
      const sprite = s.add.sprite(w.x, w.y + 42, key, 0).setOrigin(0.5, 1).setScale(PAINTED_SCALE.worker);
      const box = s.add.sprite(w.x, w.y, "p_cartons", 0).setOrigin(0.5, 1).setScale(0.2).setVisible(false);
      const band = s.add.sprite(w.x, w.y, "p_carton_bands", 1).setOrigin(0.5, 1).setScale(0.2).setVisible(false);
      this.workerSprites.push({ w, sprite, shadow, box, band });
    });
  }

  createRc() {
    const s = this.scene;
    const rc = this.sim.state.rc;
    this.rcShadow = s.add.image(rc.x, rc.y + 34, "fx_shadow").setDepth(10).setScale(0.95, 0.4).setAlpha(0.35);
    this.rcSprite = s.add.sprite(rc.x, rc.y + 38, "p_rc_operator", 0).setOrigin(0.5, 1).setScale(PAINTED_SCALE.rc);
    this.rcRing = s.add.image(rc.x, rc.y + 26, "fx_glow_amber").setDepth(9).setScale(1.0).setAlpha(0.0);
  }

  buildOverlays() {
    const s = this.scene;
    s.add.image(0, 0, "fx_vignette").setOrigin(0).setDepth(800).setAlpha(0.32);
    const wt = WEATHER_TINT[this.weather] || WEATHER_TINT.day;
    if (wt.alpha > 0) s.add.rectangle(0, 0, GAME.W, GAME.H, wt.color, wt.alpha).setOrigin(0).setDepth(805);
    this.strainOverlay = s.add.rectangle(0, 0, GAME.W, GAME.H, this.T.color.brand.hex, 0).setOrigin(0).setDepth(806);
    this.critOverlay = s.add.rectangle(0, 0, GAME.W, GAME.H, this.T.color.state.bad.hex, 0).setOrigin(0).setDepth(807);
  }

  buildInput() {
    const s = this.scene;
    ["primary", "secondary"].forEach((k) => {
      this.sim.state.sides[k].bases.forEach((base) => {
        const p = basePos(k, base.index);
        const hit = s.add.zone(p.x, p.y - 2, 100, 64).setInteractive({ useHandCursor: true }).setDepth(5);
        hit.on("pointerdown", () => this.scene.onBaseClick(base));
        hit.on("pointerover", () => { base.__hover = true; });
        hit.on("pointerout", () => { base.__hover = false; });
      });
    });
    ["raaPrimary", "raaSecondary", "emptyTrailer", "ibt"].forEach((a) => {
      const z = zoneOf(a);
      const hit = s.add.zone(z.x, z.y, z.w, z.h).setInteractive({ useHandCursor: true }).setDepth(5);
      hit.on("pointerdown", () => this.scene.onZoneClick(a));
      hit.on("pointerover", () => { this.zoneGfx[a].hover = true; });
      hit.on("pointerout", () => { this.zoneGfx[a].hover = false; });
    });
  }

  /* ---------------- per-frame ---------------- */
  update(delta, now) {
    this.now = now;
    this.updateDoors(delta);
    this.drawDynamic();
    this.updateWorkers(delta);
    this.updateRc(delta);
    this.updateFx(delta);
    this.updateMood();
  }

  updateMood() {
    const h = this.sim.state.flowHealth;
    const crit = h < this.sim.tune.flowCritical ? 0.075 + Math.sin(this.now / 260) * 0.03 : 0;
    this.critOverlay.alpha += (Math.max(0, crit) - this.critOverlay.alpha) * 0.08;
    const strain = h < this.sim.tune.flowWarning ? ((this.sim.tune.flowWarning - h) / this.sim.tune.flowWarning) * 0.07 : 0;
    this.strainOverlay.alpha += (strain - this.strainOverlay.alpha) * 0.05;
    const critical = h < this.sim.tune.flowCritical;
    const stripA = critical ? 0.9 + Math.sin(this.now / 260) * 0.1 : 0.1;
    const glowA = critical ? 0.3 + Math.sin(this.now / 260) * 0.18 : 0;
    this.critStrips.forEach((st) => {
      st.spr.alpha += (stripA - st.spr.alpha) * 0.08;
      st.glow.alpha += (glowA - st.glow.alpha) * 0.08;
    });
    this.lights.forEach((l, i) => { l.alpha = 0.11 + Math.sin(this.now / 800 + i) * 0.015; });
  }

  updateDoors(delta) {
    const st = this.sim.state;
    Object.values(this.doorSprites).forEach((d) => {
      let frame = DOOR_F.closed, lamp = null;
      if (d.group === "primary" || d.group === "secondary") {
        const side = st.sides[d.group];
        if (d.index === 0) {                    // ART (feeding) door
          if (side.refillTimer > 0) {           // trailer swapping in: shutter rolling
            d.roll += delta;
            frame = Math.floor(d.roll / 380) % 2 ? DOOR_F.third : DOOR_F.twothirds;
            lamp = PAL.yellow;
          } else if (side.artBacklog > 0) {     // trailer docked and feeding
            frame = DOOR_F.docked; lamp = PAL.green;
          } else {                              // trailer gone
            frame = DOOR_F.open;
          }
        } else {                                // RAA-supply door (prep area below)
          frame = DOOR_F.docked;
          lamp = side.raaStarved ? PAL.red : side.source === "RAA" ? PAL.green : null;
        }
      } else if (d.group === "ibt") {
        frame = st.ibt.clearing ? DOOR_F.docked : DOOR_F.closed;
        lamp = st.ibt.clearing ? PAL.cyan : null;
      } else if (d.group === "empty") {         // empty-pallet trailer bay
        frame = DOOR_F.docked;
        lamp = st.rc.job && st.rc.job.type === "restock" ? PAL.yellow : null;
      }
      d.spr.setFrame(frame);
      if (lamp) { d.glow.setFillStyle(lamp, 1).setAlpha(0.5 + Math.sin(this.now / 300) * 0.25); }
      else d.glow.setAlpha(0);
    });
  }

  drawDynamic() {
    const g = this.dynBack; g.clear();
    this.dynFront.clear();
    this.hi.clear();
    this.drawSides(g);
    this.drawStaging(g);
    this.drawSupport(g);
    this.drawHighlights();
  }

  drawSides(g) {
    Object.values(this.sim.state.sides).forEach((side) => {
      // inbound line: painted cartons with tinted bands
      const shown = Math.min(side.line.length, LINE_VISIBLE);
      this.lineSprites[side.key].forEach((slot, i) => {
        const vis = i < shown;
        slot.box.setVisible(vis); slot.band.setVisible(vis);
        if (!vis) return;
        const box = side.line[i];
        const a = box.claimed ? 0.35 : 1;
        slot.box.setAlpha(a).setTint(shadeNum(box.color, 0.45)); // light freight wash on the kraft
        slot.band.setAlpha(a).setTint(box.color);
      });
      const beltX = lineSlotPos(side.key, 0).x;
      const lc = side.line.length >= this.sim.tune.lineCap - 1 ? this.T.color.state.bad.css
        : side.line.length > 6 ? this.T.color.state.warn.css : this.T.color.state.info.css;
      this.texts.misc[`${side.key}_line`].setText(`LINE ${side.line.length}/${this.sim.tune.lineCap}`)
        .setColor(lc).setPosition(beltX, 631);
      side.bases.forEach((base, i) => { const p = basePos(side.key, i); this.drawBase(g, base, p.x, p.y, side, i); });
    });
  }

  baseFillFrame(boxes) {
    const f = boxes / this.sim.tune.baseCapacity;
    if (boxes <= 0) return PALLET_F.empty;
    if (f <= 0.34) return PALLET_F.b2;
    if (f <= 0.67) return PALLET_F.b4;
    return PALLET_F.l2;
  }

  drawBase(g, base, x, y, side, i) {
    const pop = base.pop || 0;
    const spr = this.baseSprites[side.key][i];
    const glow = this.baseGlows[side.key][i];
    const txt = this.texts.bases[side.key][i];
    const pulse = 0.5 + Math.sin(this.now / 240 + i) * 0.5;
    spr.setScale(PAINTED_SCALE.pallets * (1 + pop * 0.07));
    if (base.fullPallet) {
      // color-wrapped: the whole pallet reads its freight color for lane matching
      spr.setVisible(true).setFrame(PALLET_F.wrapped).setAlpha(1).setTint(shadeNum(base.fullPallet.color, 0.3));
      this.colorBand(g, x, y - 16, 50, 10, base.fullPallet.color, 0.9, base.fullPallet.colorKey);
      glow.setScale(1.35).setAlpha(0.28 + pulse * 0.22);
      txt.setText(`${base.fullPallet.colorKey.toUpperCase()} · FULL`).setColor(this.T.color.brandDeep.css).setPosition(x, y + 32);
    } else if (!base.empty && base.blocked) {
      spr.setVisible(false); glow.setAlpha(0);
      g.lineStyle(2, this.T.color.state.bad.hex, 0.85);
      g.strokeRoundedRect(x - 32, y - 6, 64, 30, 5);
      for (let sx = x - 30; sx < x + 26; sx += 12) { g.lineStyle(3, this.T.color.state.bad.hex, 0.5); g.lineBetween(sx, y + 22, sx + 8, y - 4); }
      txt.setText("NEED PALLET").setColor(this.T.color.state.bad.css).setPosition(x, y - 14);
    } else {
      spr.setVisible(true).setFrame(this.baseFillFrame(base.boxes)).setAlpha(base.boxes ? 1 : 0.92);
      if (base.boxes > 0 && base.color != null) spr.setTint(shadeNum(base.color, 0.5)); else spr.clearTint();
      glow.setAlpha(0);
      if (base.boxes > 0 && base.color != null) this.colorBand(g, x, y - 10, 44, 8, base.color, 0.85, base.colorKey);
      txt.setText(base.colorKey ? `${base.colorKey} ${base.boxes}/${this.sim.tune.baseCapacity}` : "OPEN")
        .setColor(base.boxes ? this.T.color.text.body.css : this.T.color.text.muted.css).setPosition(x, y + 32);
    }
    // 6-pip fill strip on the base frame (teaching signal #1)
    const cap = this.sim.tune.baseCapacity;
    const filled = base.fullPallet ? cap : base.boxes;
    for (let n = 0; n < cap; n++) {
      g.fillStyle(n < filled ? (base.fullPallet ? base.fullPallet.color : base.color || 0x94a3ad) : 0xffffff, n < filled ? 0.95 : 0.7);
      g.fillRect(x - (cap * 7) / 2 + n * 7, y + 24, 5, 4);
    }
  }

  colorBand(g, x, y, w, h, color, alpha, colorKey) {
    g.fillStyle(color, alpha); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 3);
    g.lineStyle(1, shadeNum(color, -0.35), alpha); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 3);
    if (colorKey) this.freightMark(g, x, y, colorKey, Math.max(0.7, Math.min(1, h / 9)));
  }

  /* Colorblind-safe secondary encoding (readability rule #8): every freight
   * band carries a shape mark so hue is never the only channel.
   * Standard=plain · Priority=» · Hazmat=diagonals · Oversize=⟨⟩ · Transfer=→ */
  freightMark(g, x, y, key, s = 1) {
    g.lineStyle(2, 0xffffff, 0.92);
    if (key === "Red") {
      for (const dx of [-3.5 * s, 2.5 * s]) {
        g.beginPath(); g.moveTo(x + dx - 2 * s, y - 2.5 * s); g.lineTo(x + dx + 2 * s, y); g.lineTo(x + dx - 2 * s, y + 2.5 * s); g.strokePath();
      }
    } else if (key === "Orange") {
      g.lineBetween(x - 5 * s, y + 3 * s, x - 1 * s, y - 3 * s);
      g.lineBetween(x + 1 * s, y + 3 * s, x + 5 * s, y - 3 * s);
    } else if (key === "Purple") {
      g.beginPath(); g.moveTo(x - 3 * s, y - 3 * s); g.lineTo(x - 6 * s, y); g.lineTo(x - 3 * s, y + 3 * s); g.strokePath();
      g.beginPath(); g.moveTo(x + 3 * s, y - 3 * s); g.lineTo(x + 6 * s, y); g.lineTo(x + 3 * s, y + 3 * s); g.strokePath();
    } else if (key === "Blue") {
      g.lineBetween(x - 5 * s, y, x + 3 * s, y);
      g.beginPath(); g.moveTo(x + 1 * s, y - 2.5 * s); g.lineTo(x + 5 * s, y); g.lineTo(x + 1 * s, y + 2.5 * s); g.strokePath();
    } // Brown/Standard: plain band
  }

  drawStaging(g) {
    const st = this.sim.state.staging;
    const flash = st.gpmFlash > 0;
    st.lanes.forEach((lane, i) => {
      const p = lanePos(i, this.sim.tune.stagingLanes);
      const edge = lane.mixed ? this.T.color.state.bad.hex : lane.ready ? this.T.color.state.good.hex : this.T.color.brand.hex;
      g.fillStyle(this.T.color.surface[0].hex, 0.45); g.fillRoundedRect(p.x - 19, p.y - 68, 38, 146, 6);
      g.lineStyle(2.5, edge, lane.ready || lane.mixed ? 0.95 : 0.5); g.strokeRoundedRect(p.x - 19, p.y - 68, 38, 146, 6);
      if (lane.mixed) {   // hazard header + footer
        for (const yy of [p.y - 74, p.y + 80]) {
          for (let sx = p.x - 18; sx < p.x + 14; sx += 10) {
            g.lineStyle(4, 0x151a1e, 0.85); g.lineBetween(sx, yy + 5, sx + 5, yy);
            g.lineStyle(4, 0xf5c518, 0.85); g.lineBetween(sx + 5, yy + 5, sx + 10, yy);
          }
        }
      }
      this.laneSprites[i].forEach((spr, n) => {
        const pl = lane.pallets[n];
        spr.setVisible(!!pl);
        if (pl) {
          const col = lane.mixed ? pl.color : (lane.color || pl.color);
          const key = lane.mixed ? pl.colorKey : (lane.colorKey || pl.colorKey);
          spr.setTint(shadeNum(col, 0.35)); // staged pallets carry their lane color
          this.colorBand(g, p.x, p.y + 64 - n * 44 - 18, 28, 6, col, 0.9, key);
        }
      });
      if (lane.ready && Math.sin(this.now / 200) > 0) { g.lineStyle(2.5, this.T.color.state.good.hex, 0.9); g.strokeRoundedRect(p.x - 22, p.y - 71, 44, 152, 7); }
      if (flash && lane.pallets.length === 0) { g.fillStyle(this.T.color.state.good.hex, 0.2); g.fillRoundedRect(p.x - 19, p.y - 68, 38, 146, 6); }
      const lt = this.texts.lanes[i];
      lt.tag.setText(lane.label).setPosition(p.x, p.y - 84);
      const status = lane.reserved ? "RC" : lane.mixed ? "MIX" : lane.ready ? "GPM" : lane.colorKey ? `${lane.pallets.length}/${this.sim.tune.stagingCapacity}` : "OPEN";
      lt.status.setText(status)
        .setColor(lane.mixed ? this.T.color.state.bad.css : lane.ready ? this.T.color.state.good.css : this.T.color.text.dim.css)
        .setPosition(p.x, p.y + 92);
    });
  }

  drawSupport(g) {
    const st = this.sim.state;
    ["primary", "secondary"].forEach((k) => {
      const z = zoneOf(`${k}Stack`); const stack = st.emptyStacks[k];
      this.emptySprites[k].forEach((spr, n) => spr.setVisible(n < stack.count));
      const col = stack.count <= 1 ? this.T.color.state.bad.css : stack.count <= 3 ? this.T.color.state.warn.css : this.T.color.state.good.css;
      this.texts.misc[`${k}Stack`].setText(`${stack.count}/${this.sim.tune.emptyStackCapacity}`).setColor(col).setPosition(z.x, z.y - 26);
    });
    const ibtZ = zoneOf("ibt");
    this.ibtSprites.forEach((spr, n) => {
      spr.setVisible(n < st.ibt.count);
      if (n < st.ibt.count) this.colorBand(g, spr.x, spr.y - 12, 18, 4, PAL.blue, 0.95, null);
    });
    this.texts.misc.ibt.setText(st.ibt.clearing ? `CLEAR ${formatTime(st.ibt.timer)}` : `${st.ibt.count}/${this.sim.tune.ibtCapacity}`)
      .setColor(st.ibt.count >= this.sim.tune.ibtCapacity ? this.T.color.state.bad.css : this.T.color.state.info.css).setPosition(ibtZ.x, ibtZ.y - 26);
    const et = zoneOf("emptyTrailer");
    this.texts.misc.emptyTrailer.setText("RESTOCK").setPosition(et.x, et.y + 34);
    ["primary", "secondary"].forEach((k) => {
      const side = st.sides[k]; const z = zoneOf(`raa${cap1(k)}`);
      const maxPrep = side.raaStackingLocked ? 1 : this.sim.tune.raaPrepCapacity;
      this.raaSprites[k].forEach((spr, n) => spr.setVisible(n < side.raaPrep));
      for (let n = 0; n < maxPrep; n++) {
        g.fillStyle(n < side.raaPrep ? (side.raaStackingLocked ? this.T.color.state.bad.hex : this.T.color.state.warn.hex) : 0xffffff,
          n < side.raaPrep ? 0.95 : 0.65);
        g.fillRoundedRect(z.x - (maxPrep * 16) / 2 + n * 16, z.y - 12, 12, 10, 2);
      }
      this.texts.misc[`raa${cap1(k)}`].setText(side.raaStackingLocked ? `RAA ${side.raaPrep}/1 LOCK` : `RAA ${side.raaPrep}/${maxPrep}`)
        .setColor(side.raaStackingLocked ? this.T.color.state.bad.css : this.T.color.state.warn.css).setPosition(z.x, z.y - 26);
    });
  }

  drawHighlights() {
    const g = this.hi, pulse = 0.5 + Math.sin(this.now / 220) * 0.5;
    const armed = this.sim.state.partialArmed;
    Object.values(this.sim.state.sides).forEach((side) => {
      side.bases.forEach((base) => {
        const p = basePos(side.key, base.index);
        if (base.fullPallet) {
          g.lineStyle(3, base.__hover ? this.T.color.brand.hex : this.T.color.state.warn.hex, 0.45 + pulse * 0.5);
          g.strokeRoundedRect(p.x - 44, p.y - 40, 88, 70, 8);
        } else if (armed && base.empty && !base.blocked && base.boxes >= this.sim.tune.partialMinBoxes) {
          g.lineStyle(3, 0xea580c, 0.45 + pulse * 0.5);
          g.strokeRoundedRect(p.x - 44, p.y - 40, 88, 70, 8);
        }
      });
    });
    const room = this.sim.rc.queueRoom();
    ["raaPrimary", "raaSecondary", "emptyTrailer"].forEach((a) => {
      const zg = this.zoneGfx[a]; const want = (zg.hover && room) ? 1 : 0;
      zg.glow += (want - zg.glow) * 0.2;
      if (zg.glow > 0.03) { const z = zoneOf(a); g.lineStyle(3, z.color, zg.glow * (0.4 + pulse * 0.5)); g.strokeRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10); }
    });
  }

  /* ---------------- workers + RC sprites ---------------- */
  workerFrame(w) {
    // painted sheets (18 frames/char): front 0-2, side-walk 3-9, back 10-12, carry 13-17
    const t = this.now + w.id * 53; // de-sync strides
    if (w.carry) return 13 + (w.moving ? Math.floor(t / 90) % 5 : 0);
    if (w.moving) {
      const dx = w.tx - w.x, dy = w.ty - w.y;
      if (Math.abs(dx) >= Math.abs(dy)) return 3 + (Math.floor(t / 80) % 7);
      if (dy < 0) return 10 + (Math.floor(t / 130) % 3);
      return Math.floor(t / 130) % 3;
    }
    return 0;
  }
  sidePose(w) { return w.moving && Math.abs(w.tx - w.x) >= Math.abs(w.ty - w.y); }

  updateWorkers(delta) {
    this.workerSprites.forEach((ws) => {
      const w = ws.w, sp = ws.sprite;
      sp.setFrame(this.workerFrame(w));
      sp.setFlipX((w.carry || this.sidePose(w)) && w.facing === -1);
      const bob = w.moving ? Math.sin(this.now / 90 + w.id) * 2 : 0;
      const p = this.project(w.x, w.y);
      sp.setPosition(p.x, p.y + 42 + bob).setDepth(p.y);
      ws.shadow.setPosition(p.x, p.y + 40).setDepth(p.y - 1);
      if (w.carry && w.carry.color != null) {
        const dir = w.facing === -1 ? -1 : 1;
        ws.box.setVisible(true).setPosition(p.x + 11 * dir, p.y + 6 + bob).setDepth(p.y + 0.5).setTint(shadeNum(w.carry.color, 0.45));
        ws.band.setVisible(true).setPosition(p.x + 11 * dir, p.y + 6 + bob).setDepth(p.y + 0.6).setTint(w.carry.color);
      } else { ws.box.setVisible(false); ws.band.setVisible(false); }
    });
  }

  updateRc(delta) {
    const rc = this.sim.state.rc;
    this.rcSprite.setFrame(rc.carry ? 1 : 0);
    const bob = rc.moving ? Math.sin(this.now / 80) * 1.4 : 0;
    const p = this.project(rc.x, rc.y);
    this.rcSprite.setPosition(p.x, p.y + 38 + bob).setDepth(p.y + 1);
    this.rcSprite.setFlipX(rc.facing === -1);
    this.rcShadow.setPosition(p.x, p.y + 34).setDepth(p.y);
    const idle = !rc.job;
    this.rcRing.setPosition(p.x, p.y + 24).setDepth(p.y)
      .setAlpha(idle ? 0.22 + Math.sin(this.now / 240) * 0.14 : 0)
      .setScale(1.1 + Math.sin(this.now / 240) * 0.08);
    // freight-color chip over the carried wrapped pallet
    if (rc.carry && rc.carry.color != null) {
      const dir = rc.facing === -1 ? -1 : 1;
      this.colorBandFront(p.x + 36 * dir, p.y - 26 + bob, 30, 8, rc.carry.color, rc.carry.colorKey);
    }
    // target markers for current + queued jobs
    const jobs = [rc.job, ...rc.queue].filter(Boolean);
    jobs.forEach((j, idx) => {
      let t;
      if (j.type === "haul" || j.type === "partial") t = j.phase === "deliver" ? null : basePos(j.base.sideKey, j.base.index);
      else if (j.type === "raaPrep") t = center(zoneOf(`raa${cap1(j.sideKey)}`));
      else if (j.type === "restock") t = center(zoneOf("emptyTrailer"));
      if (!t) return;
      const col = idx === 0 ? this.T.color.brand.hex : this.T.color.accent.hex;
      this.dynFront.lineStyle(2.5, col, idx === 0 ? 0.95 : 0.55);
      this.dynFront.strokeCircle(t.x, t.y - 42, 7);
      this.dynFront.fillStyle(col, idx === 0 ? 0.95 : 0.55);
      this.dynFront.fillTriangle(t.x - 4, t.y - 51, t.x + 4, t.y - 51, t.x, t.y - 46);
    });
  }
  colorBandFront(x, y, w, h, color, colorKey) {
    this.dynFront.fillStyle(color, 0.92); this.dynFront.fillRoundedRect(x - w / 2, y - h / 2, w, h, 3);
    this.dynFront.lineStyle(1, shadeNum(color, -0.35), 0.92); this.dynFront.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 3);
    if (colorKey) this.freightMark(this.dynFront, x, y, colorKey, 0.8);
  }

  /* ---------------- FX ---------------- */
  spawnSparkle(x, y, key = "fx_glow_green") {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 70;
      const img = this.scene.add.image(x, y, key).setDepth(720).setScale(0.22).setAlpha(0.9);
      this.fx.push({ img, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0, max: 700, grow: -0.0002 });
    }
  }
  burst(x, y, color) { this.spawnSparkle(x, y, color === "amber" ? "fx_glow_amber" : color === "cyan" ? "fx_glow_cyan" : "fx_glow_green"); }
  updateFx(delta) {
    const dt = delta / 1000;
    this.fx = this.fx.filter((p) => {
      p.life += delta; const t = p.life / p.max;
      p.img.x += p.vx * dt; p.img.y += p.vy * dt; p.vy += 40 * dt;
      p.img.setAlpha((1 - t) * 0.9); p.img.setScale(Math.max(0.04, p.img.scaleX + p.grow * delta));
      if (p.life >= p.max) { p.img.destroy(); return false; }
      return true;
    });
  }
  destroy() { this.fx.forEach((p) => p.img.destroy()); this.fx = []; }
}

window.WorldRenderer = WorldRenderer;
