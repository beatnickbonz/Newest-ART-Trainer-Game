/* =============================================================================
 * WorldRenderer: polished 2.5D warehouse. Static scenery built once; dynamic
 * freight / workers / FX redrawn each frame from sim state.
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
    this.doorOpen = { primary: 1, secondary: 1, empty: 0.2, ibt: 0.4 };
    this.trailerSlide = { primary: 1, secondary: 1 };
    this.workerSprites = [];
    this.texts = { bases: { primary: [], secondary: [] }, lanes: [], misc: {} };
    this.build();
  }

  /* ---------------- static build ---------------- */
  build() {
    const s = this.scene;
    this.buildFloor();
    this.buildWall();
    this.buildRacks();
    this.buildZones();
    this.buildLights();
    this.dynBack = s.add.graphics().setDepth(150);   // bases / pallets / lanes
    this.dynFront = s.add.graphics().setDepth(640);   // selection rings, carried hints
    this.zoneHi = s.add.graphics().setDepth(9);       // assignable-zone highlight
    this.buildTextPools();
    this.createWorkerSprites();
    this.buildOverlays();
    this.buildZoneInput();
  }

  buildFloor() {
    const s = this.scene;
    s.add.image(0, 0, "tex_concrete").setOrigin(0).setDisplaySize(GAME.W, GAME.H).setDepth(0).setTint(0xb9c2c7);
    const tile = s.add.tileSprite(0, 0, GAME.W, GAME.H, "tex_concrete").setOrigin(0).setDepth(1).setAlpha(0.9);
    tile.tileScaleX = 1; tile.tileScaleY = 1;

    const g = s.add.graphics().setDepth(2);
    // perimeter aisle markings
    g.lineStyle(3, PAL.floorLine, 0.18);
    for (let x = 96; x < GAME.W; x += 128) g.lineBetween(x, 70, x, GAME.H - 60);
    // hazard band around staging
    const st = zoneOf("staging");
    this.hazardBand(g, st.x - st.w / 2 - 14, st.y + st.h / 2 - 6, st.w + 28, 12);
    // directional arrows from docks toward staging
    g.fillStyle(PAL.floorLine, 0.12);
    [[ -1, zoneOf("primary")], [1, zoneOf("secondary")]].forEach(([dir, z]) => {
      for (let i = 0; i < 3; i++) {
        const ax = z.x + dir * (40 + i * 30), ay = z.y + z.h / 2 + 22;
        g.fillTriangle(ax, ay - 8, ax, ay + 8, ax + dir * 12, ay);
      }
    });
  }

  hazardBand(g, x, y, w, h) {
    g.fillStyle(PAL.amber, 0.05); g.fillRect(x, y, w, h);
    for (let sx = x - h; sx < x + w; sx += 18) {
      g.lineStyle(5, PAL.amber, 0.16);
      g.lineBetween(sx, y + h, sx + h, y);
    }
  }

  buildWall() {
    const s = this.scene;
    const wy = LAYOUT.dockWall.y, wh = LAYOUT.dockWall.h;
    // wall slab
    s.add.tileSprite(0, wy, GAME.W, wh, "tex_metal").setOrigin(0).setDepth(85).setTint(0x9aa6ad);
    const g = s.add.graphics().setDepth(86);
    g.fillStyle(PAL.bg0, 0.5); g.fillRect(0, wy, GAME.W, 6);
    g.fillStyle(0x000000, 0.35); g.fillRect(0, wy + wh - 8, GAME.W, 12); // base AO shadow on floor
    // doors
    this.doors = {};
    Object.entries(LAYOUT.doors).forEach(([key, list]) => {
      list.forEach((d, i) => this.buildDoor(`${key}${i}`, key, d.x, wy, wh));
    });
    // hanging sign
    this.buildSign(GAME.W / 2, wy + 6, "RECEIVE DOCK · INBOUND");
  }

  buildDoor(id, group, x, wy, wh) {
    const s = this.scene;
    const w = 92, h = wh + 6;
    const c = s.add.container(x, wy).setDepth(88);
    const frame = s.add.graphics();
    frame.fillStyle(0x0c1216, 1); frame.fillRoundedRect(-w / 2, 0, w, h, 4);
    frame.lineStyle(3, shadeNum(PAL.steel, 0.2), 1); frame.strokeRoundedRect(-w / 2, 0, w, h, 4);
    // opening (dark)
    const opening = s.add.graphics();
    opening.fillStyle(0x05080a, 1); opening.fillRect(-w / 2 + 8, 8, w - 16, h - 14);
    // trailer behind opening (for ART docks)
    const trailer = s.add.image(0, 18, "tex_trailer").setOrigin(0.5, 0).setDisplaySize(w - 14, h - 10).setVisible(group === "primary" || group === "secondary");
    // roll-up shutter (animated height)
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
        // stored pallets
        for (let p = 0; p < 2; p++) {
          const f = FREIGHT[(r + p) % FREIGHT.length];
          g.fillStyle(shadeNum(f.color, -0.1), 0.9); g.fillRect(x - 22 + p * 24, ry - 26, 20, 24);
          g.fillStyle(shadeNum(f.color, 0.15), 0.9); g.fillRect(x - 22 + p * 24, ry - 26, 20, 6);
        }
      }
    });
  }

  buildZones() {
    const s = this.scene;
    this.zoneGfx = {};
    ZONES.forEach((z) => {
      const g = s.add.graphics().setDepth(8);
      const isPost = !z.noWorkerAssignment;
      g.fillStyle(z.color, isPost ? 0.06 : 0.05);
      g.fillRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10);
      g.lineStyle(2, z.color, isPost ? 0.4 : 0.3);
      g.strokeRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10);
      // header tab
      const tabW = Math.min(z.w - 16, z.label.length * 8 + 34);
      g.fillStyle(z.color, 0.16); g.fillRoundedRect(z.x - z.w / 2 + 8, z.y - z.h / 2 + 6, tabW, 20, 5);
      const icon = s.add.image(z.x - z.w / 2 + 20, z.y - z.h / 2 + 16, `ic_${z.icon}`)
        .setDisplaySize(15, 15).setTint(z.color).setDepth(9);
      const label = s.add.text(z.x - z.w / 2 + 32, z.y - z.h / 2 + 16, z.label, {
        fontFamily: FONTS.ui, fontSize: 12, color: CSS.text, fontStyle: "600",
      }).setOrigin(0, 0.5).setDepth(9);
      this.zoneGfx[z.assignment] = { g, icon, label, glow: 0 };
    });
  }

  buildLights() {
    const s = this.scene;
    const pts = [[340, 250], [640, 230], [940, 250], [490, 560], [790, 560], [640, 470]];
    this.lights = pts.map(([x, y]) => s.add.image(x, y, "fx_light").setDepth(60).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6).setAlpha(0.5));
  }

  buildTextPools() {
    const s = this.scene;
    const mk = (size, color) => s.add.text(0, 0, "", { fontFamily: FONTS.ui, fontSize: size, color, fontStyle: "600" }).setOrigin(0.5).setDepth(220);
    ["primary", "secondary"].forEach((k) => {
      for (let i = 0; i < this.sim.tune.baseCount; i++) this.texts.bases[k].push(mk(10, CSS.white));
    });
    for (let i = 0; i < this.sim.tune.stagingLanes; i++) {
      this.texts.lanes.push({ tag: mk(11, CSS.white), status: mk(10, CSS.text) });
    }
    this.texts.misc.primaryStack = mk(13, CSS.white);
    this.texts.misc.secondaryStack = mk(13, CSS.white);
    this.texts.misc.ibt = mk(12, CSS.white);
    this.texts.misc.emptyTrailer = mk(10, CSS.amber);
    this.texts.misc.raaPrimary = mk(10, CSS.yellow);
    this.texts.misc.raaSecondary = mk(10, CSS.yellow);
    ["primary", "secondary"].forEach((k) => { this.texts.misc[`${k}_in`] = mk(11, CSS.cyan); });
  }

  createWorkerSprites() {
    const s = this.scene;
    this.sim.workers.workers.forEach((w) => {
      const shadow = s.add.image(w.x, w.y + 24, "fx_shadow").setDepth(10).setScale(0.5, 0.32).setAlpha(0.5);
      const sprite = s.add.sprite(w.x, w.y, WORKER_SHEET.key, this.workerFrame(w))
        .setScale(WORKER_SHEET.scale).setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", (p, lx, ly, ev) => { ev.stopPropagation(); this.sim.workers.select(w); });
      const ring = s.add.image(w.x, w.y + 22, "fx_glow_amber").setDepth(9).setScale(0.7).setVisible(false);
      this.workerSprites.push({ w, sprite, shadow, ring, role: "worker" });
    });
  }

  buildOverlays() {
    const s = this.scene;
    s.add.image(0, 0, "fx_vignette").setOrigin(0).setDepth(800).setAlpha(0.9);
    const wt = WEATHER_TINT[this.weather] || WEATHER_TINT.day;
    if (wt.alpha > 0) s.add.rectangle(0, 0, GAME.W, GAME.H, wt.color, wt.alpha).setOrigin(0).setDepth(805);
    // critical pulse overlay (driven in update)
    this.critOverlay = s.add.rectangle(0, 0, GAME.W, GAME.H, PAL.red, 0).setOrigin(0).setDepth(806);
  }

  buildZoneInput() {
    const s = this.scene;
    ZONES.forEach((z) => {
      const hit = s.add.zone(z.x, z.y, z.w, z.h).setInteractive({ useHandCursor: true }).setDepth(5);
      hit.on("pointerdown", () => this.scene.onZoneClick(z.assignment));
      hit.on("pointerover", () => { if (this.zoneGfx[z.assignment]) this.zoneGfx[z.assignment].hover = true; });
      hit.on("pointerout", () => { if (this.zoneGfx[z.assignment]) this.zoneGfx[z.assignment].hover = false; });
    });
  }

  /* ---------------- per-frame update ---------------- */
  update(delta, now) {
    this.now = now;
    this.updateDoors(delta);
    this.drawDynamic();
    this.updateWorkers(delta);
    this.updateFx(delta);
    this.updateMood(delta);
  }

  updateMood(delta) {
    const h = this.sim.state.flowHealth;
    const target = h < this.sim.tune.flowCritical ? 0.12 + Math.sin(this.now / 220) * 0.06 : 0;
    this.critOverlay.alpha += (Math.max(0, target) - this.critOverlay.alpha) * 0.1;
    // light flicker
    this.lights.forEach((l, i) => { l.alpha = 0.46 + Math.sin(this.now / 700 + i) * 0.04; });
  }

  updateDoors(delta) {
    const st = this.sim.state;
    const target = (key) => {
      const side = st.sides[key];
      return side.refillTimer > 0 ? 0 : 1; // open when trailer docked
    };
    ["primary", "secondary"].forEach((k) => {
      const t = target(k);
      this.doorOpen[k] += (t - this.doorOpen[k]) * Math.min(1, delta / 350);
    });
    Object.values(this.doors).forEach((d) => {
      let open = 0.5;
      if (d.group === "primary") open = this.doorOpen.primary;
      else if (d.group === "secondary") open = this.doorOpen.secondary;
      else if (d.group === "ibt") open = st.ibt.clearing ? 1 : 0.35;
      else if (d.group === "empty") open = 0.3;
      this.drawShutter(d, open);
      const refilling = (d.group === "primary" && st.sides.primary.refillTimer > 0) || (d.group === "secondary" && st.sides.secondary.refillTimer > 0);
      d.lamp.fillColor = refilling ? PAL.yellow : PAL.green;
      d.trailer.setAlpha(0.55 + open * 0.45);
    });
  }

  drawShutter(d, open) {
    const g = d.shutter; g.clear();
    const top = 8, full = d.h - 16, x = -d.w / 2 + 8, w = d.w - 16;
    const closed = full * (1 - open);
    if (closed <= 1) return;
    for (let y = 0; y < closed; y += 8) {
      g.fillStyle(y % 16 === 0 ? shadeNum(PAL.steel, 0.18) : PAL.steel, 1);
      g.fillRect(x, top + y, w, 7);
    }
    g.lineStyle(1, 0x000000, 0.3);
    for (let y = 0; y < closed; y += 8) g.lineBetween(x, top + y, x + w, top + y);
  }

  drawDynamic() {
    const g = this.dynBack; g.clear();
    const f = this.dynFront; f.clear();
    this.drawSides(g);
    this.drawStaging(g);
    this.drawSupport(g);
    this.drawSelection(f);
    this.updateZoneGlow();
  }

  drawSides(g) {
    Object.values(this.sim.state.sides).forEach((side) => {
      side.bases.forEach((base, i) => {
        const p = basePos(side.key, i);
        this.drawBase(g, base, p.x, p.y, side, i);
        if (base.pop > 0) base.pop = Math.max(0, base.pop - 0.06);
      });
    });
  }

  drawBase(g, base, x, y, side, i) {
    const pop = base.pop || 0;
    // platform / pallet
    g.fillStyle(0x000000, 0.22); g.fillEllipse(x, y + 20, 78, 16);
    g.fillStyle(shadeNum(PAL.brown, -0.1), 0.95); g.fillRoundedRect(x - 40, y + 8, 80, 14, 3);
    g.fillStyle(shadeNum(PAL.brown, 0.08), 0.95); g.fillRoundedRect(x - 40, y + 8, 80, 5, 3);

    const txt = this.texts.bases[side.key][i];
    if (base.fullPallet) {
      this.drawWrappedPallet(g, x, y, base.fullPallet.color, 1 + pop * 0.06);
      txt.setText(`${base.fullPallet.colorKey.toUpperCase()} · FULL`).setColor(CSS.yellow);
      txt.setPosition(x, y + 30);
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
      // front
      g.fillStyle(shadeNum(color, -0.22), 1); g.fillRect(x - bw / 2, by - bh, bw, bh);
      // top
      g.fillStyle(shadeNum(color, 0.18), 1);
      g.beginPath(); g.moveTo(x - bw / 2, by - bh); g.lineTo(x - bw / 2 + d, by - bh - d);
      g.lineTo(x + bw / 2 + d, by - bh - d); g.lineTo(x + bw / 2, by - bh); g.closePath(); g.fillPath();
      // side
      g.fillStyle(shadeNum(color, -0.4), 1);
      g.beginPath(); g.moveTo(x + bw / 2, by - bh); g.lineTo(x + bw / 2 + d, by - bh - d);
      g.lineTo(x + bw / 2 + d, by - d); g.lineTo(x + bw / 2, by); g.closePath(); g.fillPath();
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
      // bin
      g.fillStyle(0x000000, 0.25); g.fillRoundedRect(p.x - 20, p.y - 70, 40, 150, 6);
      g.fillStyle(shadeNum(baseColor, -0.55), 0.6); g.fillRoundedRect(p.x - 19, p.y - 68, 38, 146, 6);
      g.lineStyle(2, lane.ready ? PAL.green : lane.mixed ? PAL.red : 0x4a5d68, lane.ready ? 0.9 : 0.7);
      g.strokeRoundedRect(p.x - 19, p.y - 68, 38, 146, 6);
      // stacked pallets
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
      if (lane.pop > 0) lane.pop = Math.max(0, lane.pop - 0.05);
    });
  }

  drawSupport(g) {
    const st = this.sim.state;
    // empty stacks
    ["primary", "secondary"].forEach((k) => {
      const z = zoneOf(`${k}Stack`); const stack = st.emptyStacks[k];
      for (let n = 0; n < stack.count; n++) {
        const py = z.y + 16 - n * 5;
        g.fillStyle(shadeNum(PAL.brown, n % 2 ? -0.05 : 0.05), 0.95); g.fillRect(z.x - 28, py, 56, 5);
      }
      const col = stack.count <= 1 ? CSS.red : stack.count <= 3 ? CSS.yellow : CSS.green;
      this.texts.misc[`${k}Stack`].setText(`${stack.count}/${this.sim.tune.emptyStackCapacity}`).setColor(col).setPosition(z.x, z.y - 26);
    });
    // IBT pile
    const ibtZ = zoneOf("ibt");
    for (let n = 0; n < st.ibt.count; n++) {
      const col = n % 2 ? shadeNum(PAL.blue, -0.1) : shadeNum(PAL.blue, 0.08);
      g.fillStyle(col, 0.95); g.fillRect(ibtZ.x - 26 + (n % 3) * 4, ibtZ.y + 14 - Math.floor(n / 3) * 7, 18, 7);
    }
    const ibtTxt = st.ibt.clearing ? `CLEAR ${formatTime(st.ibt.timer)}` : `${st.ibt.count}/${this.sim.tune.ibtCapacity}`;
    this.texts.misc.ibt.setText(ibtTxt).setColor(st.ibt.count >= this.sim.tune.ibtCapacity ? CSS.red : CSS.cyan).setPosition(ibtZ.x, ibtZ.y - 26);
    // empty trailer label
    const et = zoneOf("emptyTrailer");
    this.texts.misc.emptyTrailer.setText("RESTOCK").setPosition(et.x, et.y + 28);
    // RAA prep pips
    ["primary", "secondary"].forEach((k) => {
      const side = st.sides[k]; const z = zoneOf(`raa${k[0].toUpperCase()}${k.slice(1)}`);
      const maxPrep = side.raaStackingLocked ? 1 : this.sim.tune.raaPrepCapacity;
      for (let n = 0; n < maxPrep; n++) {
        g.fillStyle(n < side.raaPrep ? (side.raaStackingLocked ? PAL.red : PAL.yellow) : 0x2a3942, n < side.raaPrep ? 0.95 : 0.6);
        g.fillRoundedRect(z.x - (maxPrep * 16) / 2 + n * 16, z.y + 6, 12, 12, 2);
      }
      this.texts.misc[`raa${k[0].toUpperCase()}${k.slice(1)}`]
        .setText(side.raaStackingLocked ? `RAA ${side.raaPrep}/1 LOCK` : `RAA ${side.raaPrep}/${maxPrep}`)
        .setColor(side.raaStackingLocked ? CSS.red : CSS.yellow).setPosition(z.x, z.y - 24);
    });
    // inbound readouts above docks
    ["primary", "secondary"].forEach((k) => {
      const side = st.sides[k]; const z = zoneOf(k);
      const full = side.bases.filter((b) => b.fullPallet).length;
      this.texts.misc[`${k}_in`].setText(`Inbound ${side.inbound.length}  ·  Full ${full}`)
        .setColor(side.inbound.length > 10 ? CSS.yellow : CSS.cyan).setPosition(z.x, z.y - z.h / 2 + 38);
    });
  }

  drawSelection(f) {
    // pulse handled in updateWorkers via ring; nothing extra here for now
  }

  updateZoneGlow() {
    const sel = this.sim.workers.selected;
    const isRc = sel && sel.assignment === "staging";
    this.zoneHi.clear();
    const pulse = 0.5 + Math.sin(this.now / 240) * 0.5;
    ZONES.forEach((z) => {
      const post = !z.noWorkerAssignment && z.assignment !== "ibt";
      const rcZone = z.assignment === "raaPrimary" || z.assignment === "raaSecondary" || z.assignment === "emptyTrailer";
      const zg = this.zoneGfx[z.assignment];
      const hover = zg && zg.hover;
      const actionable = (sel && post) || (isRc && rcZone);
      const want = hover || actionable ? 1 : 0;
      zg.glow = (zg.glow || 0) + (want - (zg.glow || 0)) * 0.18;
      if (zg.glow <= 0.03) return;
      const a = zg.glow * (0.35 + pulse * 0.45);
      this.zoneHi.lineStyle(2.5, z.color, a);
      this.zoneHi.strokeRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10);
      this.zoneHi.fillStyle(z.color, zg.glow * 0.05 * (0.6 + pulse * 0.4));
      this.zoneHi.fillRoundedRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 10);
    });
  }

  /* ---------------- workers ---------------- */
  // sheet columns: 0 front-idle, 1 side-stand, 2 back, 3 front, 4 carry-walk, 5 walk-stride, 6 tablet
  workerFrame(w) {
    const base = ((w.id - 1) % 4) * 7;
    if (w.assignment === "staging") return this.rcFrame(w);
    if (w.moving) {
      const dx = w.tx - w.x, dy = w.ty - w.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (w.carry) return base + 4;                                  // carrying, side
        return Math.floor(this.now / 165) % 2 ? base + 1 : base + 5;   // 2-frame: stride <-> passing
      }
      if (w.carry) return base + 4;
      return dy < 0 ? base + 2 : base + 0;                             // back when up, front when down
    }
    if (w.carry) return base + 4;
    return base + 0;                                                   // idle, front
  }
  // true only for left/right side poses, so we don't mirror front/back views
  sidePose(w) {
    if (!w.moving) return false;
    return Math.abs(w.tx - w.x) >= Math.abs(w.ty - w.y);
  }
  rcFrame(w) {
    const job = w.job;
    if (job?.type === "ibt" || job?.type === "staging") return 5 + (w.id % 3);
    if (job?.system === "rcRestock") return 3;
    if (job?.system === "rcRaaPrep") return 4;
    return job ? 4 : 0;
  }

  updateWorkers(delta) {
    const sel = this.sim.workers.selected;
    this.workerSprites.forEach((ws) => {
      const w = ws.w;
      const wantRole = w.assignment === "staging" ? "rc" : "worker";
      if (ws.role !== wantRole) {
        ws.role = wantRole;
        if (wantRole === "rc") ws.sprite.setTexture(RC_SHEET.key, this.rcFrame(w)).setScale(RC_SHEET.scale);
        else ws.sprite.setTexture(WORKER_SHEET.key, this.workerFrame(w)).setScale(WORKER_SHEET.scale);
      } else {
        ws.sprite.setFrame(this.workerFrame(w));
      }
      const bob = w.moving ? Math.sin(this.now / 90 + w.bob) * 2.2 : Math.sin(this.now / 320 + w.bob) * 1;
      ws.sprite.x = w.x;
      ws.sprite.y = w.y + bob;
      ws.sprite.setDepth(w.y);
      if (wantRole === "rc") ws.sprite.setFlipX(w.facing === 1);
      else ws.sprite.setFlipX(this.sidePose(w) && w.facing === -1);
      ws.sprite.setTint(sel === w ? 0xfff0c0 : 0xffffff);
      ws.shadow.setPosition(w.x, w.y + (wantRole === "rc" ? 30 : 26)).setDepth(w.y - 1)
        .setScale(wantRole === "rc" ? 0.85 : 0.5, wantRole === "rc" ? 0.4 : 0.32);
      // selection ring
      ws.ring.setVisible(sel === w).setPosition(w.x, w.y + 24).setDepth(w.y - 1)
        .setScale(0.8 + Math.sin(this.now / 200) * 0.06).setAlpha(0.5 + Math.sin(this.now / 200) * 0.2);
      // carried box hint
      if (w.carry && wantRole !== "rc" && w.carry.color) {
        // drawn via dynFront
        this.dynFront.fillStyle(shadeNum(w.carry.color, 0.1), 1);
        this.dynFront.fillRoundedRect(w.x - 9, w.y - 6 + bob, 18, 14, 2);
      }
      // forklift dust + beep
      if (wantRole === "rc" && w.moving && Math.random() < 0.12) this.spawnPuff(w.x - w.facing * 18, w.y + 26);
    });
  }

  /* ---------------- FX ---------------- */
  spawnPuff(x, y) {
    const img = this.scene.add.image(x, y, "fx_glow_white").setDepth(700).setScale(0.18).setAlpha(0.35).setTint(0xc9d2d6);
    this.fx.push({ img, vx: (Math.random() - 0.5) * 12, vy: -8 - Math.random() * 10, life: 0, max: 600, grow: 0.0006 });
  }
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
      p.life += delta;
      const t = p.life / p.max;
      p.img.x += p.vx * dt; p.img.y += p.vy * dt; p.vy += 40 * dt;
      p.img.setAlpha((1 - t) * (p.img.alpha > 0.5 ? 0.9 : 0.4));
      p.img.setScale(Math.max(0.04, p.img.scaleX + p.grow * delta));
      if (p.life >= p.max) { p.img.destroy(); return false; }
      return true;
    });
  }

  destroy() {
    this.fx.forEach((p) => p.img.destroy());
    this.fx = [];
  }
}

window.WorldRenderer = WorldRenderer;
