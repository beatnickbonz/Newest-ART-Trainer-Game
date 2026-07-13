/* =============================================================================
 * Textures: procedural Canvas2D textures generated once at boot (soft shadows,
 * light pools, concrete, brushed metal, 2.5D freight boxes, pallets, vignette).
 * Canvas2D is used for gradients/shadows that Phaser Graphics can't match.
 * ===========================================================================*/
const Tex = (() => {
  function hex(n) { return "#" + n.toString(16).padStart(6, "0"); }
  function shade(n, amt) {
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function canvas(scene, key, w, h) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const t = scene.textures.createCanvas(key, w, h);
    return { t, c: t.getContext() };
  }

  function softShadow(scene) {
    const { t, c } = canvas(scene, "fx_shadow", 128, 128);
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.6, "rgba(0,0,0,0.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    t.refresh();
  }

  function lightPool(scene) {
    const { t, c } = canvas(scene, "fx_light", 256, 256);
    const g = c.createRadialGradient(128, 128, 8, 128, 128, 126);
    g.addColorStop(0, "rgba(255,234,190,0.55)");
    g.addColorStop(0.45, "rgba(255,221,160,0.16)");
    g.addColorStop(1, "rgba(255,221,160,0)");
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    t.refresh();
  }

  function glow(scene, key, css) {
    const { t, c } = canvas(scene, key, 128, 128);
    const g = c.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, css);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    t.refresh();
  }

  function vignette(scene) {
    const { t, c } = canvas(scene, "fx_vignette", GAME.W, GAME.H);
    const g = c.createRadialGradient(GAME.W / 2, GAME.H / 2, GAME.H * 0.35, GAME.W / 2, GAME.H / 2, GAME.W * 0.7);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(2,4,6,0.62)");
    c.fillStyle = g; c.fillRect(0, 0, GAME.W, GAME.H);
    t.refresh();
  }

  function concrete(scene) {
    const S = 256;
    const { t, c } = canvas(scene, "tex_concrete", S, S);
    c.fillStyle = hex(PAL.floor); c.fillRect(0, 0, S, S);
    // speckle
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const v = Math.random();
      c.fillStyle = v > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
      c.fillRect(x, y, 1.4, 1.4);
    }
    // faint stains
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 18 + Math.random() * 40;
      const g = c.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, "rgba(0,0,0,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    t.refresh();
  }

  function metal(scene) {
    const W = 128, H = 96;
    const { t, c } = canvas(scene, "tex_metal", W, H);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(PAL.steelLight, 0.1));
    g.addColorStop(0.5, hex(PAL.steel));
    g.addColorStop(1, shade(PAL.steel, -0.35));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 220; i++) {
      c.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)";
      const y = Math.random() * H; c.fillRect(0, y, W, 0.6);
    }
    t.refresh();
  }

  /* A 2.5D freight box: front face + lighter top face + tape seam. */
  function freightBox(scene, f) {
    const W = 56, H = 60, depth = 14, fw = 44, fh = 38;
    const { t, c } = canvas(scene, `box_${f.key}`, W, H);
    const ox = (W - fw) / 2, oy = H - fh - 2;
    // shadow base
    c.fillStyle = "rgba(0,0,0,0.18)"; c.beginPath();
    c.ellipse(W / 2, H - 4, fw / 2, 5, 0, 0, Math.PI * 2); c.fill();
    // front
    const fg = c.createLinearGradient(0, oy, 0, oy + fh);
    fg.addColorStop(0, shade(f.color, 0.05));
    fg.addColorStop(1, shade(f.color, -0.28));
    c.fillStyle = fg; c.fillRect(ox, oy, fw, fh);
    // top
    c.fillStyle = shade(f.color, 0.22);
    c.beginPath();
    c.moveTo(ox, oy); c.lineTo(ox + depth, oy - depth);
    c.lineTo(ox + fw + depth, oy - depth); c.lineTo(ox + fw, oy);
    c.closePath(); c.fill();
    // side
    c.fillStyle = shade(f.color, -0.4);
    c.beginPath();
    c.moveTo(ox + fw, oy); c.lineTo(ox + fw + depth, oy - depth);
    c.lineTo(ox + fw + depth, oy + fh - depth); c.lineTo(ox + fw, oy + fh);
    c.closePath(); c.fill();
    // tape seam + edges
    c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 1;
    c.strokeRect(ox, oy, fw, fh);
    c.strokeStyle = "rgba(255,255,255,0.18)";
    c.beginPath(); c.moveTo(ox + fw / 2, oy - depth + 2); c.lineTo(ox + fw / 2, oy + fh); c.stroke();
    t.refresh();
  }

  /* Wooden pallet (empty base). */
  function pallet(scene) {
    const W = 88, H = 40;
    const { t, c } = canvas(scene, "tex_pallet", W, H);
    c.fillStyle = "rgba(0,0,0,0.2)"; c.beginPath();
    c.ellipse(W / 2, H - 5, W / 2 - 4, 6, 0, 0, Math.PI * 2); c.fill();
    const top = 8;
    c.fillStyle = shade(PAL.brown, 0.05);
    c.fillRect(6, top, W - 12, 16);
    c.fillStyle = shade(PAL.brown, -0.3);
    c.fillRect(6, top + 16, W - 12, 8);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = shade(PAL.brown, -0.12);
      c.fillRect(8 + i * ((W - 16) / 5), top, 4, 16);
    }
    c.strokeStyle = "rgba(0,0,0,0.25)"; c.strokeRect(6, top, W - 12, 24);
    t.refresh();
  }

  /* Stretch-wrapped full pallet (color-tinted band). */
  function fullPallet(scene, f) {
    const W = 80, H = 64;
    const { t, c } = canvas(scene, `pallet_${f.key}`, W, H);
    c.fillStyle = "rgba(0,0,0,0.22)"; c.beginPath();
    c.ellipse(W / 2, H - 5, W / 2 - 6, 6, 0, 0, Math.PI * 2); c.fill();
    // pallet feet
    c.fillStyle = shade(PAL.brown, -0.2); c.fillRect(8, H - 16, W - 16, 8);
    // wrapped stack
    const g = c.createLinearGradient(0, 6, 0, H - 14);
    g.addColorStop(0, shade(f.color, 0.12));
    g.addColorStop(1, shade(f.color, -0.3));
    c.fillStyle = g; rr(c, 10, 6, W - 20, H - 22, 4); c.fill();
    // wrap sheen
    c.fillStyle = "rgba(255,255,255,0.12)"; c.fillRect(14, 10, 6, H - 30);
    c.strokeStyle = "rgba(255,255,255,0.18)"; c.lineWidth = 1; rr(c, 10, 6, W - 20, H - 22, 4); c.stroke();
    t.refresh();
  }

  /* Trailer (top-down/3-4 view) for the dock — body + container ridges. */
  function trailer(scene) {
    const W = 132, H = 96;
    const { t, c } = canvas(scene, "tex_trailer", W, H);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#d7dde1"); g.addColorStop(0.5, "#aeb7bd"); g.addColorStop(1, "#7d878d");
    c.fillStyle = g; rr(c, 6, 6, W - 12, H - 18, 6); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 2; rr(c, 6, 6, W - 12, H - 18, 6); c.stroke();
    for (let x = 18; x < W - 14; x += 12) { c.strokeStyle = "rgba(0,0,0,0.12)"; c.beginPath(); c.moveTo(x, 8); c.lineTo(x, H - 14); c.stroke(); }
    // bumper / wheels hint
    c.fillStyle = "#23282b"; c.fillRect(14, H - 14, W - 28, 8);
    c.fillStyle = "#15181a"; c.fillRect(24, H - 12, 16, 8); c.fillRect(W - 40, H - 12, 16, 8);
    t.refresh();
  }

  /* Rasterize the embedded CC-BY SVG icons so they can be tinted in-game. */
  function loadIcons(scene, size = 96) {
    const data = window.ICON_SVGS || {};
    Object.keys(data).forEach((k) => {
      scene.load.svg(`ic_${k}`, data[k], { width: size, height: size });
    });
  }

  function generateAll(scene) {
    softShadow(scene);
    lightPool(scene);
    vignette(scene);
    concrete(scene);
    metal(scene);
    pallet(scene);
    trailer(scene);
    glow(scene, "fx_glow_white", "rgba(255,255,255,0.9)");
    glow(scene, "fx_glow_amber", "rgba(245,165,36,0.9)");
    glow(scene, "fx_glow_red", "rgba(244,63,94,0.9)");
    glow(scene, "fx_glow_green", "rgba(52,211,153,0.9)");
    glow(scene, "fx_glow_cyan", "rgba(56,189,248,0.9)");
    FREIGHT.forEach((f) => { freightBox(scene, f); fullPallet(scene, f); });
  }

  return { generateAll, loadIcons, hex, shade, rr };
})();
window.Tex = Tex;
