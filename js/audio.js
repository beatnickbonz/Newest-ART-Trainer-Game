/* =============================================================================
 * Audio: lightweight WebAudio synth (no external files). UI + floor SFX and a
 * subtle ambient warehouse bed. All synthesized for reliability.
 * ===========================================================================*/
const Sound = (() => {
  let ctx = null;
  let master = null;
  let ambientNodes = null;
  let musicNodes = null;
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
    startMusic(); // background track begins on the first user gesture, persists across scenes
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

  /* ---- ambient bed: air-handler room tone ----
   * Looping band-limited noise only. The previous bed (55Hz sawtooth through an
   * LFO-swept lowpass) read as a constant feedback whine on small speakers —
   * no oscillators here, nothing periodic to whine. */
  function startAmbient() {
    if (!ensure() || ambientNodes) return;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.035, ctx.currentTime, 1.2);
    g.connect(master);
    const dur = 2.0;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 60; hp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320; lp.Q.value = 0.5;
    src.connect(hp); hp.connect(lp); lp.connect(g);
    src.start();
    ambientNodes = { g, src };
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    const n = ambientNodes;
    n.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => { try { n.src.stop(); } catch (e) {} }, 800);
    ambientNodes = null;
  }

  /* ---- background music ----
   * Prefers an embedded produced track (window.MUSIC_DATA, a data URI) if one is
   * dropped in; otherwise plays a procedurally composed loop synthesized here.
   * Routed through `master`, so global mute (M) covers it. No external files. */
  let musicBuf = null; // shared noise buffer for hats

  function mnote(dest, o) {
    const t0 = o.t0;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + o.dur);
    const peak = o.gain != null ? o.gain : 0.1;
    const atk = o.attack != null ? o.attack : 0.012;
    const rel = o.release != null ? o.release : 0.08;
    const hold = Math.max(t0 + atk, t0 + o.dur - rel);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.setValueAtTime(peak, hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(dest);
    osc.start(t0); osc.stop(t0 + o.dur + 0.03);
  }

  function mkick(dest, t0) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc.connect(g); g.connect(dest);
    osc.start(t0); osc.stop(t0 + 0.24);
  }

  function mhat(dest, t0, gain) {
    const src = ctx.createBufferSource(); src.buffer = musicBuf;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain != null ? gain : 0.022, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    src.connect(hp); hp.connect(g); g.connect(dest);
    src.start(t0); src.stop(t0 + 0.05);
  }

  function msnare(dest, t0) {
    const src = ctx.createBufferSource(); src.buffer = musicBuf;
    const bp = ctx.createBiquadFilter(); bp.type = "highpass"; bp.frequency.value = 1900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t0); src.stop(t0 + 0.14);
    const o = ctx.createOscillator(); const og = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(230, t0); o.frequency.exponentialRampToValueAtTime(150, t0 + 0.08);
    og.gain.setValueAtTime(0.05, t0); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    o.connect(og); og.connect(dest); o.start(t0); o.stop(t0 + 0.12);
  }

  function startMusic() {
    if (!ensure() || musicNodes) return;
    if (window.MUSIC_DATA) startMusicFile(window.MUSIC_DATA);
    else startMusicSynth();
  }

  function startMusicSynth() {
    const mg = ctx.createGain();
    mg.gain.value = 0.0001;
    mg.gain.setTargetAtTime(0.16, ctx.currentTime, 2.0); // sits under gameplay SFX
    mg.connect(master);

    if (!musicBuf) {
      musicBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.3), ctx.sampleRate);
      const d = musicBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    // Upbeat, rhythmic: 116 BPM, backbeat groove, bouncy syncopated bass, 16-step grid.
    const bpm = 116, beat = 60 / bpm, bar = beat * 4, sixteenth = beat / 4;
    // I–vi–IV–V in C major
    const chords = [
      { bass: 130.81, pad: [261.63, 329.63, 392.00], scale: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25] }, // C
      { bass: 110.00, pad: [220.00, 261.63, 329.63], scale: [220.00, 261.63, 293.66, 329.63, 392.00, 440.00] }, // Am
      { bass: 174.61, pad: [174.61, 220.00, 261.63], scale: [349.23, 392.00, 440.00, 523.25, 587.33, 698.46] }, // F
      { bass: 196.00, pad: [196.00, 246.94, 293.66], scale: [392.00, 440.00, 493.88, 587.33, 659.25, 783.99] }, // G
    ];
    // groove templates (16th steps): kick, snare backbeat, bass hits (r=root, f=fifth)
    const KICK = [0, 8, 11];
    const SNARE = [4, 12];
    const BASS = { 0: "r", 6: "f", 8: "r", 11: "f", 14: "r" };
    // syncopated 16-step melodies (index into the 6-note scale, null = rest)
    const patterns = [
      [0, null, 2, null, 3, null, 2, 4, null, 3, null, 2, 0, null, 2, null],
      [3, null, null, 2, 0, null, 2, 3, null, 4, 3, null, 2, null, 0, null],
      [4, 3, null, 2, null, 3, 4, null, 3, null, 2, 0, null, 2, null, 3],
      [0, null, 2, 3, 4, null, 3, 2, 3, null, 2, null, 0, 2, null, null],
    ];
    const phrase = [0, 1, 2, 1, 0, 3, 2, 3]; // 8-bar arrangement, then repeats

    let barIndex = 0;
    let nextBarTime = ctx.currentTime + 0.12;

    function scheduleBar(t, idx) {
      const c = chords[idx % 4];
      // pad — sustained triad
      c.pad.forEach((f) => mnote(mg, { freq: f, type: "triangle", t0: t, dur: bar * 0.96, gain: 0.04, attack: 0.3, release: 0.4 }));
      // drums — kick + backbeat snare
      KICK.forEach((s) => mkick(mg, t + s * sixteenth));
      SNARE.forEach((s) => msnare(mg, t + s * sixteenth));
      // hats — driving 8ths, accented on the off-beats
      for (let s = 0; s < 16; s += 2) mhat(mg, t + s * sixteenth, s % 4 === 2 ? 0.03 : 0.016);
      // bass — punchy, syncopated root/fifth
      Object.entries(BASS).forEach(([s, kind]) => {
        const f = kind === "f" ? c.bass * 1.5 : c.bass;
        mnote(mg, { freq: f, type: "sine", t0: t + s * sixteenth, dur: sixteenth * 1.7, gain: kind === "f" ? 0.1 : 0.13, attack: 0.006, release: 0.06 });
      });
      // melody — syncopated pluck
      const pat = patterns[phrase[barIndex % phrase.length]];
      pat.forEach((n, k) => {
        if (n == null) return;
        const hum = (Math.random() - 0.5) * 0.008;
        mnote(mg, { freq: c.scale[n], type: "triangle", t0: t + k * sixteenth + hum, dur: sixteenth * 1.6, gain: 0.08, attack: 0.006, release: 0.09 });
      });
    }

    const pump = () => {
      let guard = 0;
      while (nextBarTime < ctx.currentTime + 0.6 && guard++ < 8) {
        scheduleBar(nextBarTime, barIndex);
        nextBarTime += bar;
        barIndex++;
      }
    };
    const timer = setInterval(pump, 60);
    pump();
    musicNodes = { mg, timer, type: "synth" };
  }

  function startMusicFile(uri) {
    const mg = ctx.createGain();
    mg.gain.value = 0.0001;
    mg.connect(master);
    musicNodes = { mg, type: "file" };
    fetch(uri).then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)).then((buf) => {
      if (!musicNodes || musicNodes.type !== "file") return; // stopped before decode finished
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.connect(mg); src.start();
      mg.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5); // produced tracks are already mixed
      musicNodes.src = src;
    }).catch(() => { // decode failed → fall back to the synth loop
      if (musicNodes && musicNodes.type === "file") { try { musicNodes.mg.disconnect(); } catch (e) {} musicNodes = null; startMusicSynth(); }
    });
  }

  function stopMusic() {
    if (!musicNodes) return;
    const n = musicNodes;
    if (n.timer) clearInterval(n.timer);
    n.mg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);
    if (n.src) setTimeout(() => { try { n.src.stop(); } catch (e) {} }, 1100);
    setTimeout(() => { try { n.mg.disconnect(); } catch (e) {} }, 1400);
    musicNodes = null;
  }

  function isPlayingMusic() { return !!musicNodes; }

  function initFromSave() {
    const s = Save.settings();
    volume = s.volume; muted = s.muted;
  }

  return { unlock, play, setVolume, setMuted, isMuted, getVolume, startAmbient, stopAmbient, startMusic, stopMusic, isPlayingMusic, initFromSave };
})();
window.Sound = Sound;
