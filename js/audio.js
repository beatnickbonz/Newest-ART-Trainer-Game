/* =============================================================================
 * Audio: lightweight WebAudio synth (no external files). UI + floor SFX and a
 * subtle ambient warehouse bed. All synthesized for reliability.
 * ===========================================================================*/
const Sound = (() => {
  let ctx = null;
  let master = null;
  let ambientNodes = null;
  let muted = false;
  let volume = 0.8;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    return ctx;
  }

  function unlock() {
    ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function applyGain() {
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  }
  function setVolume(v) { volume = clamp(v, 0, 1); applyGain(); }
  function setMuted(m) { muted = m; applyGain(); }
  function isMuted() { return muted; }
  function getVolume() { return volume; }

  function tone(opt) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + (opt.delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opt.type || "sine";
    o.frequency.setValueAtTime(opt.freq, t0);
    if (opt.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.slideTo), t0 + opt.dur);
    const peak = (opt.gain != null ? opt.gain : 0.25);
    const atk = opt.attack != null ? opt.attack : 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opt.dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + opt.dur + 0.02);
  }

  function noise(opt) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + (opt.delay || 0);
    const dur = opt.dur || 0.2;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = opt.filter || "bandpass";
    f.frequency.value = opt.freq || 800;
    f.Q.value = opt.q || 1;
    const g = ctx.createGain();
    const peak = opt.gain != null ? opt.gain : 0.15;
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* ---- named SFX ---- */
  const sfx = {
    hover: () => tone({ freq: 520, type: "sine", dur: 0.05, gain: 0.06 }),
    click: () => { tone({ freq: 320, type: "square", dur: 0.06, gain: 0.12 }); tone({ freq: 540, type: "sine", dur: 0.08, gain: 0.08, delay: 0.02 }); },
    select: () => { tone({ freq: 480, type: "triangle", dur: 0.09, gain: 0.14, slideTo: 720 }); },
    assign: () => { tone({ freq: 420, type: "triangle", dur: 0.1, gain: 0.14, slideTo: 640 }); tone({ freq: 760, type: "sine", dur: 0.12, gain: 0.08, delay: 0.05 }); },
    deny: () => { tone({ freq: 220, type: "sawtooth", dur: 0.14, gain: 0.12, slideTo: 150 }); },
    beep: () => tone({ freq: 880, type: "square", dur: 0.08, gain: 0.06 }),
    palletDrop: () => { noise({ freq: 220, filter: "lowpass", q: 0.7, dur: 0.18, gain: 0.18 }); tone({ freq: 140, type: "sine", dur: 0.16, gain: 0.12, slideTo: 80 }); },
    laneComplete: () => { [523, 659, 784].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.18, gain: 0.12, delay: i * 0.06 })); },
    raaPrep: () => { tone({ freq: 300, type: "triangle", dur: 0.12, gain: 0.12, slideTo: 460 }); noise({ freq: 600, dur: 0.1, gain: 0.06 }); },
    trailer: () => { tone({ freq: 90, type: "sawtooth", dur: 0.5, gain: 0.16, slideTo: 60 }); tone({ freq: 660, type: "square", dur: 0.1, gain: 0.05, delay: 0.5 }); },
    restock: () => { tone({ freq: 360, type: "triangle", dur: 0.1, gain: 0.1, slideTo: 520 }); tone({ freq: 520, type: "triangle", dur: 0.1, gain: 0.1, delay: 0.1, slideTo: 680 }); },
    warn: () => { tone({ freq: 440, type: "square", dur: 0.12, gain: 0.1 }); tone({ freq: 440, type: "square", dur: 0.12, gain: 0.1, delay: 0.16 }); },
    critical: () => { tone({ freq: 300, type: "sawtooth", dur: 0.18, gain: 0.14 }); tone({ freq: 220, type: "sawtooth", dur: 0.22, gain: 0.14, delay: 0.2 }); },
    star: (i = 0) => tone({ freq: 660 + i * 220, type: "triangle", dur: 0.22, gain: 0.16 }),
    shiftEnd: () => { [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.3, gain: 0.13, delay: i * 0.12 })); },
    fanfare: () => { [523, 659, 784, 1046].forEach((f, i) => { tone({ freq: f, type: "triangle", dur: 0.4, gain: 0.14, delay: i * 0.1 }); }); },
  };

  function play(name, arg) { if (sfx[name]) sfx[name](arg); }

  /* ---- ambient bed: low machinery hum + airy pad ---- */
  function startAmbient() {
    if (!ensure() || ambientNodes) return;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);
    g.connect(master);
    const o1 = ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 55;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180;
    o1.connect(lp); lp.connect(g);
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 110;
    const g2 = ctx.createGain(); g2.gain.value = 0.4; o2.connect(g2); g2.connect(g);
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain(); lfoG.gain.value = 30; lfo.connect(lfoG); lfoG.connect(lp.frequency);
    o1.start(); o2.start(); lfo.start();
    ambientNodes = { g, o1, o2, lfo };
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    const { g, o1, o2, lfo } = ambientNodes;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => { try { o1.stop(); o2.stop(); lfo.stop(); } catch (e) {} }, 800);
    ambientNodes = null;
  }

  function initFromSave() {
    const s = Save.settings();
    volume = s.volume; muted = s.muted;
  }

  return { unlock, play, setVolume, setMuted, isMuted, getVolume, startAmbient, stopAmbient, initFromSave };
})();
window.Sound = Sound;
