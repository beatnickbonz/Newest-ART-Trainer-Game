/* =============================================================================
 * Save: campaign progress + settings via localStorage (graceful if blocked).
 * ===========================================================================*/
const Save = (() => {
  const KEY = "wfc.save.v1";
  const DEFAULT = {
    settings: { volume: 0.8, muted: false, hints: true },
    progress: {}, // scenarioId -> { stars, bestScore, bestFlow, completed }
    seenTutorial: false,
  };

  let data = clone(DEFAULT);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) data = Object.assign(clone(DEFAULT), JSON.parse(raw));
    } catch (e) { /* storage blocked — run in-memory */ }
    return data;
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function settings() { return data.settings; }
  function setSetting(k, v) { data.settings[k] = v; persist(); }

  function progressFor(id) {
    return data.progress[id] || { stars: 0, bestScore: 0, bestFlow: 0, completed: false };
  }

  function recordResult(id, result) {
    const prev = progressFor(id);
    data.progress[id] = {
      stars: Math.max(prev.stars, result.stars),
      bestScore: Math.max(prev.bestScore, result.score),
      bestFlow: Math.max(prev.bestFlow, Math.round(result.avgFlow)),
      completed: prev.completed || result.stars > 0,
    };
    persist();
    return data.progress[id];
  }

  function totalStars() {
    return Object.values(data.progress).reduce((s, p) => s + (p.stars || 0), 0);
  }

  /* Scenario N unlocks once scenario N-1 has been completed (>=1 star). */
  function isUnlocked(index, scenarios) {
    if (index <= 0) return true;
    const prev = scenarios[index - 1];
    return progressFor(prev.id).completed;
  }

  function markTutorialSeen() { data.seenTutorial = true; persist(); }
  function seenTutorial() { return data.seenTutorial; }

  function reset() { data = clone(DEFAULT); persist(); }

  return { load, settings, setSetting, progressFor, recordResult, totalStars, isUnlocked, markTutorialSeen, seenTutorial, reset };
})();
window.Save = Save;
