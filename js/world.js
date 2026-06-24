/* =============================================================================
 * WorldRenderer — RC OPERATOR edition. Polished 2.5D warehouse. Static scenery
 * built once; inbound lines, shuttling workers, the player's forklift, freight,
 * and FX redrawn each frame from sim state. Bases are click targets for hauling.
 * ===========================================================================*/

function shadeNum(color, amt) {
  let r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

const WEATHER_TINT = {
  day: { color: 0x000000, alpha: 0 },
  dawn: { color: 0xf59e42, alpha: 0.1 },
  dusk: { color: 0xb45cf5, alpha: 0.12 },
  night: { color: 0x0b1a3a, alpha: 0.26 },
};

class WorldRenderer {
  constructor(scene, sim, opts = {}) {
    this.scene = scene;
    this.sim = sim;
    this.weather = opts.weather || "day";
    this.now = 0;
    this.fx = [];
    this.doorOpen = { primary: 1, secondary: 1 };
    this.workerSprites = [];
    this.texts = { bases: { primary: [], secondary: [] }, lanes: [], misc: {} };
    this.build();
  }

  build() {
    const s = this.scene;
    this.buildFloor();
    this.buildWall();
    this.buildRacks();
    this.buildConveyors();
    this.buildZones();
    this.buildLights();
    this.dynBack = s.add.graphics().setDepth(150);
    this.dynFront = s.add.graphics().setDepth(640);
    this.hi = s.add.graphics().setDepth(9);
    this.buildTextPools();
    this.createWorkerSprites();
    this.createRc();
    this.buildOverlays();
    this.buildInput();
  }

  buildFloor() {
    const s = this.scene;
    s.add.image(0, 0, "tex_concrete").setOrigin(0).setDisplaySize(GAME.W, GAME.H).setDepth(0).setTint(0xb9c2c7);
    s.add.tileSprite(0, 0, GAME.W, GAME.H, "tex_concrete").setOrigin(0).setDepth(1).setAlpha(0.9);
    const g = s.add.graphics().setDepth(2);
    g.lineStyle(3, PAL.floorLine, 0.16);
    for (let x = 96; x < GAME.W; x += 128) g.lineBetween(x, 70, x, GAME.H - 60);
    const st = zoneOf("staging");
    this.hazardBand(g, st.x - st.w / 2 - 14, st.y + st.h / 2 - 6, st.w + 28, 12);
  }
  hazardBand(g, x, y, w, h) {
    g.fillStyle(PAL.amber, 0.05); g.fillRect(x, y, w, h);
    for (let sx = x - h; sx < x + w; sx += 18) { g.lineStyle(5, PAL.amber, 0.16); g.lineBetween(sx, y + h, sx + h, y); }
  }

  buildWall() {
    const s = this.scene;
    const wy = LAYOUT.dockWall.y, wh = LAYOUT.dockWall.h;
    s.add.tileSprite(0, wy, GAME.W, wh, "tex_metal").setOrigin(0).setDepth(85).setTint(0x9aa6ad);
    const g = s.add.graphics().setDepth(86);
    g.fillStyle(PAL.bg0, 0.5); g.fillRect(0, wy, GAME.W, 6);
    g.fillStyle(0x000000, 0.35); g.fillRect(0, wy + wh - 8, GAME.W, 12);
    this.doors = {};
    Object.entries(LAYOUT.doors).forEach(([key, list]) => list.forEach((d, i) => this.buildDoor(`${key}${i}`, key, d.x, wy, wh)));
    this.buildSign(GAME.W / 2, wy + 6, "RECEIVE DOCK · INBOUND");
  }
  buildDoor(id, group, x, wy, wh) {
    const s = this.scene;
    const w = 92, h = wh + 6;
    const c = s.add.container(x, wy).setDepth(88);
    const frame = s.add.graphics();
    frame.fillStyle(0x0c1216, 1); frame.fillRoundedRect(-w / 2, 0, w, h, 4);
    frame.lineStyle(3, shadeNum(PAL.steel, 0.2), 1); frame.strokeRoundedRect(-w / 2, 0, w, h, 4);
    const opening = s.add.graphics();
    opening.fillStyle(0x05080a, 1); opening.fillRect(-w / 2 + 8, 8, w - 16, h - 14);
    const trailer = s.add.image(0, 18, "tex_trailer").setOrigin(0.5, 0).setDisplaySize(w - 14, h - 10).setVisible(group === "primary" || group === "secondary");
    const shutter = s.add.graphics();
    const lamp = s.add.circle(w / 2 - 12, 12, 4, PAL.green, 1);
    c.add([frame, opening, trailer, shutter, lamp]);
    this.doors[id] = { c, shutter, trailer, lamp, group, w, h };
  }
  buildSign(x, y, label) {
    const s = this.scene;
    const c = s.add.container(x, y).setDepth(120);
    const g = s.add.graphics();
    g.fillStyle(0x0c1216, 0.95); g.fillRoundedRect(-150, -2, 300, 26, 5);
    g.lineStyle(2, PAL.amber, 0.5); g.strokeRoundedRect(-150, -2, 300, 26, 5);
    const t = s.add.text(0, 11, label, { fontFamily: FONTS.ui, fontSize: 14, color: CSS.amber, fontStyle: "600" }).setOrigin(0.5);
    c.add([g, t]);
  }

  buildRacks() {
    const s = this.scene;
    [40, GAME.W - 40].forEach((x) => {
      const g = s.add.graphics().setDepth(80);
      g.fillStyle(0x0e1519, 0.96); g.fillRoundedRect(x - 30, 150, 60, 360, 5);
      g.lineStyle(3, PAL.steelLight, 0.9); g.strokeRoundedRect(x - 30, 150, 60, 360, 5);
      for (let r = 0; r < 4; r++) {
        const ry = 168 + r * 86;
        g.fillStyle(PAL.amberDark, 0.85); g.fillRect(x - 26, ry, 52, 6);
        for (let p = 0; p < 2; p++) {
          const f = FREIGHT[(r + p) % FREIGHT.length];
          g.fillStyle(shadeNum(f.color, -0.1), 0.9); g.fillRect(x - 22 + p * 24, ry - 26, 20, 24);
          g.fillStyle(shadeNum(f.color, 0.15), 0.9); g.fillRect(x - 22 + p * 24, ry - 26, 20, 6);
        }
      }
    });
  }

  buildConveyors() {
    const s = this.scene;
    ["primary", "secondary"].forEach((k) => {
      const z = zoneOf(k);
      const g = s.add.graphics().setDepth(6);
      const bx = z.x - 78, by = z.y - z.h / 2 + 12, bw = 156, bh = 26;
      g.fillStyle(0x10181d, 0.95); g.fillRoundedRect(bx, by, bw, bh, 5);
      g.lineStyle(1.5, PAL.steelLight, 0.8); g.strokeRoundedRect(bx, by, bw, bh, 5);
      for (let cx = bx + 6; cx < bx + bw - 6; cx += 16) {
        g.lineStyle(2, PAL.amber, 0.22); g.lineBetween(cx, by + 4, cx + 8, by + bh / 2); g.lineBetween(cx + 8, by + bh / 2, cx, by + bh - 4);
      }
    });
  }

  buildZones() {
    const s = this.scene;
    this.zoneGfx = {};
    ZONES.forEach((z) => {
      const g = s.add.graphics().setDepth(8);
      g.fillStyle(z.color, 0.05); g.fillRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10);
      g.lineStyle(2, z.color, z.noWorkerAssignment ? 0.3 : 0.38); g.strokeRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10);
      const tabW = Math.min(z.w - 16, z.label.length * 8 + 34);
      g.fillStyle(z.color, 0.16); g.fillRoundedRect(z.x - z.w / 2 + 8, z.y + z.h / 2 - 26, tabW, 20, 5);
      s.add.image(z.x - z.w / 2 + 20, z.y + z.h / 2 - 16, `ic_${z.icon}`).setDisplaySize(15, 15).setTint(z.color).setDepth(9);
      s.add.text(z.x - z.w / 2 + 32, z.y + z.h / 2 - 16, z.label, { fontFamily: FONTS.ui, fontSize: 12, color: CSS.text, fontStyle: "600" }).setOrigin(0, 0.5).setDepth(9);
      this.zoneGfx[z.assignment] = { hover: false, glow: 0 };
    });
  }

  buildLights() {
    const s = this.scene;
    const pts = [[352, 250], [640, 230], [928, 250], [490, 560], [790, 560], [640, 470]];
    this.lights = pts.map(([x, y]) => s.add.image(x, y, "fx_light").setDepth(60).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setAlpha(0.5));
  }

  buildTextPools() {
    const s = this.scene;
    const mk = (size, color) => s.add.text(0, 0, "", { fontFamily: FONTS.ui, fontSize: size, color, fontStyle: "600" }).setOrigin(0.5).setDepth(220);
    ["primary", "secondary"].forEach((k) => { for (let i = 0; i < this.sim.tune.baseCount; i++) this.texts.bases[k].push(mk(10, CSS.white)); });
    for (let i = 0; i < this.sim.tune.stagingLanes; i++) this.texts.lanes.push({ tag: mk(11, CSS.white), status: mk(10, CSS.text) });
    this.texts.misc.primaryStack = mk(13, CSS.white);
    this.texts.misc.secondaryStack = mk(13, CSS.white);
    this.texts.misc.ibt = mk(12, CSS.white);
    this.texts.misc.emptyTrailer = mk(10, CSS.amber);
    this.texts.misc.raaPrimary = mk(10, CSS.yellow);
    this.texts.misc.raaSecondary = mk(10, CSS.yellow);
    ["primary", "secondary"].forEach((k) => { this.texts.misc[`${k}_line`] = mk(11, CSS.cyan); });
  }

  createWorkerSprites() {
    const s = this.scene;
    this.sim.workers.workers.forEach((w) => {
      const shadow = s.add.image(w.x, w.y + 24, "fx_shadow").setDepth(10).setScale(0.5, 0.32).setAlpha(0.5);
      const sprite = s.add.sprite(w.x, w.y, WORKER_SHEET.key, ((w.id - 1) % 4) * 7).setScale(WORKER_SHEET.scale);
      this.workerSprites.push({ w, sprite, shadow });
    });
  }

  createRc() {
    const s = this.scene;
    const rc = this.sim.state.rc;
    this.rcShadow = s.add.image(rc.x, rc.y + 30, "fx_shadow").setDepth(10).setScale(0.9, 0.42).setAlpha(0.55);
    this.rcSprite = s.add.sprite(rc.x, rc.y, RC_SHEET.key, 0).setScale(RC_SHEET.scale);
    this.rcRing = s.add.image(rc.x, rc.y + 26, "fx_glow_amber").setDepth(9).setScale(1.0).setAlpha(0.0);
  }

  buildOverlays() {
    const s = this.scene;
    s.add.image(0, 0, "fx_vignette").setOrigin(0).setDepth(800).setAlpha(0.9);
    const wt = WEATHER_TINT[this.weather] || WEATHER_TINT.day;
    if (wt.alpha > 0) s.add.rectangle(0, 0, GAME.W, GAME.H, wt.color, wt.alpha).setOrigin(0).setDepth(805);
    this.critOverlay = s.add.rectangle(0, 0, GAME.W, GAME.H, PAL.red, 0).setOrigin(0).setDepth(806);
  }

  buildInput() {
    const s = this.scene;
    // base click targets (haul)
    ["primary", "secondary"].forEach((k) => {
      this.sim.state.sides[k].bases.forEach((base) => {
        const p = basePos(k, base.index);
        const hit = s.add.zone(p.x, p.y - 2, 100, 64).setInteractive({ useHandCursor: true }).setDepth(5);
        hit.on("pointerdown", () => this.scene.onBaseClick(base));
        hit.on("pointerover", () => { base.__hover = true; });
        hit.on("pointerout", () => { base.__hover = false; });
      });
    });
    // RC-target zones (RAA prep, empty trailer) + IBT
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
    const target = h < this.sim.tune.flowCritical ? 0.12 + Math.sin(this.now / 220) * 0.06 : 0;
    this.critOverlay.alpha += (Math.max(0, target) - this.critOverlay.alpha) * 0.1;
    this.lights.forEach((l, i) => { l.alpha = 0.46 + Math.sin(this.now / 700 + i) * 0.04; });
  }

  updateDoors(delta) {
    const st = this.sim.state;
    ["primary", "secondary"].forEach((k) => {
      const t = st.sides[k].refillTimer > 0 ? 0 : 1;
      this.doorOpen[k] += (t - this.doorOpen[k]) * Math.min(1, delta / 350);
    });
    Object.values(this.doors).forEach((d) => {
      let open = 0.4;
      if (d.group === "primary") open = this.doorOpen.primary;
      else if (d.group === "secondary") open = this.doorOpen.secondary;
      else if (d.group === "ibt") open = st.ibt.clearing ? 1 : 0.35;
      this.drawShutter(d, open);
      const refilling = (d.group === "primary" && st.sides.primary.refillTimer > 0) || (d.group === "secondary" && st.sides.secondary.refillTimer > 0);
      d.lamp.fillColor = refilling ? PAL.yellow : PAL.green;
      if (d.trailer.visible) d.trailer.setAlpha(0.55 + open * 0.45);
    });
  }
  drawShutter(d, open) {
    const g = d.shutter; g.clear();
    const top = 8, full = d.h - 16, x = -d.w / 2 + 8, w = d.w - 16;
    const closed = full * (1 - open);
    if (closed <= 1) return;
    for (let y = 0; y < closed; y += 8) { g.fillStyle(y % 16 === 0 ? shadeNum(PAL.steel, 0.18) : PAL.steel, 1); g.fillRect(x, top + y, w, 7); }
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
      // inbound line (conveyor boxes)
      const shown = Math.min(side.line.length, LINE_VISIBLE);
      for (let i = 0; i < shown; i++) {
        const p = lineSlotPos(side.key, i); const box = side.line[i];
        const a = box.claimed ? 0.4 : 1;
        g.fillStyle(shadeNum(box.color, -0.2), a); g.fillRect(p.x - 8, p.y - 8, 16, 16);
        g.fillStyle(shadeNum(box.color, 0.18), a); g.fillRect(p.x - 8, p.y - 8, 16, 5);
        g.lineStyle(1, 0x000000, 0.25 * a); g.strokeRect(p.x - 8, p.y - 8, 16, 16);
      }
      const z = zoneOf(side.key);
      this.texts.misc[`${side.key}_line`].setText(`LINE ${side.line.length}/${this.sim.tune.lineCap}`)
        .setColor(side.line.length >= this.sim.tune.lineCap - 1 ? CSS.red : side.line.length > 6 ? CSS.yellow : CSS.cyan)
        .setPosition(z.x + 64, z.y - z.h / 2 + 22);
      // bases
      side.bases.forEach((base, i) => { const p = basePos(side.key, i); this.drawBase(g, base, p.x, p.y, side, i); });
    });
  }

  drawBase(g, base, x, y, side, i) {
    const pop = base.pop || 0;
    g.fillStyle(0x000000, 0.22); g.fillEllipse(x, y + 20, 78, 16);
    g.fillStyle(shadeNum(PAL.brown, -0.1), 0.95); g.fillRoundedRect(x - 40, y + 8, 80, 14, 3);
    g.fillStyle(shadeNum(PAL.brown, 0.08), 0.95); g.fillRoundedRect(x - 40, y + 8, 80, 5, 3);
    const txt = this.texts.bases[side.key][i];
    if (base.fullPallet) {
      this.drawWrappedPallet(g, x, y, base.fullPallet.color, 1 + pop * 0.06);
      txt.setText(`${base.fullPallet.colorKey.toUpperCase()} · FULL`).setColor(CSS.yellow).setPosition(x, y + 30);
    } else if (!base.empty && base.blocked) {
      g.fillStyle(PAL.red, 0.16); g.fillRoundedRect(x - 36, y - 28, 72, 36, 5);
      g.lineStyle(2, PAL.red, 0.7); g.strokeRoundedRect(x - 36, y - 28, 72, 36, 5);
      txt.setText("NEED PALLET").setColor(CSS.red).setPosition(x, y - 10);
    } else {
      this.drawBoxStack(g, x, y + 6, base.color || PAL.steelLight, base.boxes, pop);
      txt.setText(base.colorKey ? `${base.colorKey} ${base.boxes}/${this.sim.tune.baseCapacity}` : "OPEN")
        .setColor(base.boxes ? CSS.text : CSS.muted).setPosition(x, y + 30);
    }
  }

  drawBoxStack(g, x, baseY, color, count, pop) {
    const bw = 30, bh = 11, d = 7;
    for (let n = 0; n < count; n++) {
      const popY = (n === count - 1 ? pop * 6 : 0);
      const by = baseY - n * (bh + 1) - popY;
      g.fillStyle(shadeNum(color, -0.22), 1); g.fillRect(x - bw / 2, by - bh, bw, bh);
      g.fillStyle(shadeNum(color, 0.18), 1);
      g.beginPath(); g.moveTo(x - bw / 2, by - bh); g.lineTo(x - bw / 2 + d, by - bh - d); g.lineTo(x + bw / 2 + d, by - bh - d); g.lineTo(x + bw / 2, by - bh); g.closePath(); g.fillPath();
      g.fillStyle(shadeNum(color, -0.4), 1);
      g.beginPath(); g.moveTo(x + bw / 2, by - bh); g.lineTo(x + bw / 2 + d, by - bh - d); g.lineTo(x + bw / 2 + d, by - d); g.lineTo(x + bw / 2, by); g.closePath(); g.fillPath();
    }
  }

  drawWrappedPallet(g, x, y, color, scale) {
    const w = 60 * scale, h = 40 * scale;
    g.fillStyle(shadeNum(PAL.brown, -0.2), 1); g.fillRect(x - w / 2, y + 4, w, 8);
    g.fillStyle(shadeNum(color, -0.05), 0.96); g.fillRoundedRect(x - w / 2, y - h + 6, w, h, 4);
    g.fillStyle(shadeNum(color, 0.18), 0.96); g.fillRoundedRect(x - w / 2, y - h + 6, w, 8, 4);
    g.fillStyle(0xffffff, 0.12); g.fillRect(x - w / 2 + 5, y - h + 10, 5, h - 10);
    g.lineStyle(1.5, 0xffffff, 0.18); g.strokeRoundedRect(x - w / 2, y - h + 6, w, h, 4);
  }

  drawStaging(g) {
    const st = this.sim.state.staging;
    const flash = st.gpmFlash > 0;
    st.lanes.forEach((lane, i) => {
      const p = lanePos(i, this.sim.tune.stagingLanes);
      const baseColor = lane.mixed ? PAL.red : lane.ready ? PAL.green : (lane.color || 0x2a3942);
      g.fillStyle(0x000000, 0.25); g.fillRoundedRect(p.x - 20, p.y - 70, 40, 150, 6);
      g.fillStyle(shadeNum(baseColor, -0.55), 0.6); g.fillRoundedRect(p.x - 19, p.y - 68, 38, 146, 6);
      g.lineStyle(2, lane.ready ? PAL.green : lane.mixed ? PAL.red : 0x4a5d68, lane.ready ? 0.9 : 0.7);
      g.strokeRoundedRect(p.x - 19, p.y - 68, 38, 146, 6);
      lane.pallets.forEach((pl, n) => {
        const py = p.y + 64 - n * 44;
        const col = lane.mixed ? pl.color : baseColor;
        g.fillStyle(shadeNum(col, -0.1), 0.96); g.fillRoundedRect(p.x - 16, py - 36, 32, 36, 3);
        g.fillStyle(shadeNum(col, 0.16), 0.96); g.fillRoundedRect(p.x - 16, py - 36, 32, 7, 3);
        g.fillStyle(0xffffff, 0.1); g.fillRect(p.x - 13, py - 32, 4, 30);
      });
      if (lane.ready && Math.sin(this.now / 200) > 0) { g.lineStyle(2, PAL.green, 0.9); g.strokeRoundedRect(p.x - 22, p.y - 71, 44, 152, 7); }
      if (flash && lane.pallets.length === 0) { g.fillStyle(PAL.green, 0.18); g.fillRoundedRect(p.x - 19, p.y - 68, 38, 146, 6); }
      const lt = this.texts.lanes[i];
      lt.tag.setText(lane.label).setPosition(p.x, p.y - 76);
      const status = lane.reserved ? "RC" : lane.mixed ? "MIX" : lane.ready ? "GPM" : lane.colorKey ? `${lane.pallets.length}/${this.sim.tune.stagingCapacity}` : "OPEN";
      lt.status.setText(status).setColor(lane.mixed ? CSS.red : lane.ready ? CSS.green : CSS.muted).setPosition(p.x, p.y + 90);
    });
  }

  drawSupport(g) {
    const st = this.sim.state;
    ["primary", "secondary"].forEach((k) => {
      const z = zoneOf(`${k}Stack`); const stack = st.emptyStacks[k];
      for (let n = 0; n < stack.count; n++) { const py = z.y + 16 - n * 5; g.fillStyle(shadeNum(PAL.brown, n % 2 ? -0.05 : 0.05), 0.95); g.fillRect(z.x - 28, py, 56, 5); }
      const col = stack.count <= 1 ? CSS.red : stack.count <= 3 ? CSS.yellow : CSS.green;
      this.texts.misc[`${k}Stack`].setText(`${stack.count}/${this.sim.tune.emptyStackCapacity}`).setColor(col).setPosition(z.x, z.y - 26);
    });
    const ibtZ = zoneOf("ibt");
    for (let n = 0; n < st.ibt.count; n++) { const col = n % 2 ? shadeNum(PAL.blue, -0.1) : shadeNum(PAL.blue, 0.08); g.fillStyle(col, 0.95); g.fillRect(ibtZ.x - 26 + (n % 3) * 4, ibtZ.y + 14 - Math.floor(n / 3) * 7, 18, 7); }
    this.texts.misc.ibt.setText(st.ibt.clearing ? `CLEAR ${formatTime(st.ibt.timer)}` : `${st.ibt.count}/${this.sim.tune.ibtCapacity}`)
      .setColor(st.ibt.count >= this.sim.tune.ibtCapacity ? CSS.red : CSS.cyan).setPosition(ibtZ.x, ibtZ.y - 26);
    const et = zoneOf("emptyTrailer");
    this.texts.misc.emptyTrailer.setText("RESTOCK").setPosition(et.x, et.y + 28);
    ["primary", "secondary"].forEach((k) => {
      const side = st.sides[k]; const z = zoneOf(`raa${cap1(k)}`);
      const maxPrep = side.raaStackingLocked ? 1 : this.sim.tune.raaPrepCapacity;
      for (let n = 0; n < maxPrep; n++) { g.fillStyle(n < side.raaPrep ? (side.raaStackingLocked ? PAL.red : PAL.yellow) : 0x2a3942, n < side.raaPrep ? 0.95 : 0.6); g.fillRoundedRect(z.x - (maxPrep * 16) / 2 + n * 16, z.y + 6, 12, 12, 2); }
      this.texts.misc[`raa${cap1(k)}`].setText(side.raaStackingLocked ? `RAA ${side.raaPrep}/1 LOCK` : `RAA ${side.raaPrep}/${maxPrep}`)
        .setColor(side.raaStackingLocked ? CSS.red : CSS.yellow).setPosition(z.x, z.y - 24);
    });
  }

  drawHighlights() {
    const g = this.hi, pulse = 0.5 + Math.sin(this.now / 220) * 0.5;
    const armed = this.sim.state.partialArmed;
    // haulable full pallets + partial-eligible (when armed)
    Object.values(this.sim.state.sides).forEach((side) => {
      side.bases.forEach((base) => {
        const p = basePos(side.key, base.index);
        if (base.fullPallet) {
          g.lineStyle(2.5, base.__hover ? PAL.amber : PAL.yellow, 0.4 + pulse * 0.5);
          g.strokeRoundedRect(p.x - 44, p.y - 34, 88, 62, 8);
        } else if (armed && base.empty && !base.blocked && base.boxes >= this.sim.tune.partialMinBoxes) {
          g.lineStyle(2.5, PAL.orange, 0.4 + pulse * 0.5);
          g.strokeRoundedRect(p.x - 44, p.y - 34, 88, 62, 8);
        }
      });
    });
    // RC-target zones glow when RC has queue room
    const room = this.sim.rc.queueRoom();
    ["raaPrimary", "raaSecondary", "emptyTrailer"].forEach((a) => {
      const zg = this.zoneGfx[a]; const want = (zg.hover && room) ? 1 : 0;
      zg.glow += (want - zg.glow) * 0.2;
      if (zg.glow > 0.03) { const z = zoneOf(a); g.lineStyle(2.5, z.color, zg.glow * (0.4 + pulse * 0.5)); g.strokeRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10); }
    });
  }

  /* ---------------- workers + RC sprites ---------------- */
  workerFrame(w) {
    const base = ((w.id - 1) % 4) * 7;
    if (w.moving) {
      const dx = w.tx - w.x, dy = w.ty - w.y;
      if (Math.abs(dx) >= Math.abs(dy)) { if (w.carry) return base + 4; return Math.floor(this.now / 165) % 2 ? base + 1 : base + 5; }
      if (w.carry) return base + 4;
      return dy < 0 ? base + 2 : base + 0;
    }
    if (w.carry) return base + 4;
    return base + 0;
  }
  sidePose(w) { return w.moving && Math.abs(w.tx - w.x) >= Math.abs(w.ty - w.y); }

  updateWorkers(delta) {
    this.workerSprites.forEach((ws) => {
      const w = ws.w;
      ws.sprite.setFrame(this.workerFrame(w));
      const bob = w.moving ? Math.sin(this.now / 90 + w.id) * 2.2 : 0;
      ws.sprite.setPosition(w.x, w.y + bob).setDepth(w.y);
      ws.sprite.setFlipX(this.sidePose(w) && w.facing === -1);
      ws.shadow.setPosition(w.x, w.y + 26).setDepth(w.y - 1);
      if (w.carry && w.carry.color) {
        this.dynFront.fillStyle(shadeNum(w.carry.color, 0.1), 1);
        this.dynFront.fillRoundedRect(w.x - 9, w.y - 6 + bob, 18, 14, 2);
        this.dynFront.lineStyle(1, 0x000000, 0.3); this.dynFront.strokeRoundedRect(w.x - 9, w.y - 6 + bob, 18, 14, 2);
      }
    });
  }

  rcFrame(rc) {
    const j = rc.job;
    if (j && (j.type === "haul" || j.type === "partial") && j.phase === "deliver") return 5 + (Math.floor(this.now / 200) % 3);
    if (j && j.type === "restock") return 3;
    if (j && j.type === "raaPrep") return 4;
    return j ? 4 : 0;
  }

  updateRc(delta) {
    const rc = this.sim.state.rc;
    this.rcSprite.setFrame(this.rcFrame(rc));
    const bob = rc.moving ? Math.sin(this.now / 80) * 1.6 : 0;
    this.rcSprite.setPosition(rc.x, rc.y + bob).setDepth(rc.y + 1);
    this.rcSprite.setFlipX(rc.facing === 1);
    this.rcShadow.setPosition(rc.x, rc.y + 30).setDepth(rc.y);
    // idle pulse ring to show the player's avatar
    const idle = !rc.job;
    this.rcRing.setPosition(rc.x, rc.y + 24).setDepth(rc.y)
      .setAlpha(idle ? 0.25 + Math.sin(this.now / 240) * 0.18 : 0)
      .setScale(1.1 + Math.sin(this.now / 240) * 0.08);
    if (rc.carry && rc.carry.color) {
      this.dynFront.fillStyle(shadeNum(rc.carry.color, 0.05), 1);
      this.dynFront.fillRoundedRect(rc.x - 16, rc.y - 18 + bob, 32, 22, 3);
      this.dynFront.fillStyle(shadeNum(rc.carry.color, 0.2), 1); this.dynFront.fillRoundedRect(rc.x - 16, rc.y - 18 + bob, 32, 6, 3);
      this.dynFront.lineStyle(1, 0xffffff, 0.2); this.dynFront.strokeRoundedRect(rc.x - 16, rc.y - 18 + bob, 32, 22, 3);
    }
    // target markers for current + queued jobs
    const jobs = [rc.job, ...rc.queue].filter(Boolean);
    jobs.forEach((j, idx) => {
      let t;
      if (j.type === "haul" || j.type === "partial") t = j.phase === "deliver" ? null : basePos(j.base.sideKey, j.base.index);
      else if (j.type === "raaPrep") t = center(zoneOf(`raa${cap1(j.sideKey)}`));
      else if (j.type === "restock") t = center(zoneOf("emptyTrailer"));
      if (!t) return;
      const col = idx === 0 ? PAL.amber : PAL.cyan;
      this.dynFront.lineStyle(2, col, idx === 0 ? 0.9 : 0.5);
      this.dynFront.strokeCircle(t.x, t.y - 36, 7);
      this.dynFront.fillStyle(col, idx === 0 ? 0.9 : 0.5);
      this.dynFront.fillTriangle(t.x - 4, t.y - 45, t.x + 4, t.y - 45, t.x, t.y - 40);
    });
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
