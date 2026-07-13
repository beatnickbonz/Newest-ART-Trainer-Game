# Background Music

The game plays a looping background track, started on the first user click
(`Sound.unlock()` → `startMusic()`), persisting across every scene. Global mute
(`M`) covers it. Two sources, in priority order:

1. **Embedded produced track** — if `window.MUSIC_DATA` (a data URI) exists, it is
   decoded and looped. This is the "real song" path.
2. **Procedural composed loop** (default, shipping now) — synthesized in
   `js/audio.js` (`startMusicSynth`): 116 BPM, C-major I–vi–IV–V, on a 16-step
   grid — backbeat snare (2 & 4), syncopated kick, driving 8th-note hats, a
   bouncy root/fifth bass, and a syncopated pluck melody over an 8-bar
   arrangement, with a soft pad underneath. No external files; `file://` safe.

## Adding a real (AI-generated) song

You generate a track, drop it in, I embed it — same workflow as the sprites.

1. Generate a loop with an AI music tool (Suno, Udio, etc.). Suggested prompt:

   > Upbeat but relaxed instrumental background music for a warehouse logistics
   > management game. Bright, positive, professional "first hour of the day shift"
   > mood. Light modern lo-fi / synth-pop: warm electric piano or soft synth
   > chords, gentle plucky lead, mellow bass, soft steady beat. Not distracting,
   > loops cleanly, no vocals. ~90–100 BPM. Major key.

   Ask for **~60–120 s**, **instrumental / no vocals**, and a **seamless loop** if
   the tool offers it. Export MP3 or OGG.

2. Save it as `assets/raw/music.mp3` (or `.ogg`) and tell me it's in.

3. I convert it to an embedded data-URI module `assets/musicData.js`
   (`window.MUSIC_DATA = "data:audio/...;base64,..."`), add the `<script>` tag to
   `index.html`, and the loader plays it automatically — the synth loop stays as
   the fallback if decoding ever fails.

**Size note:** a ~90 s MP3 at 128 kbps is ~1.4 MB → ~1.9 MB as base64. Fine to
embed (sprite atlases are already ~4.6 MB), but keep the loop short to stay lean.
