/* =============================================================================
 * Bootstrap: wait for web fonts, then start Phaser with all scenes.
 * ===========================================================================*/
(function () {
  function startGame() {
    if (!window.Phaser) {
      document.body.innerHTML = "<p style='color:#fff;font:16px sans-serif;padding:24px'>Phaser failed to load. Check your connection and reload.</p>";
      return;
    }
    const S = window.SCENES;
    const config = {
      type: Phaser.AUTO,
      parent: "game",
      width: GAME.W,
      height: GAME.H,
      backgroundColor: "#05080a",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, pixelArt: false, roundPixels: false },
      scene: [S.BootScene, S.MenuScene, S.SelectScene, S.BriefScene, S.GameScene, S.ResultsScene, S.PauseScene, S.GlossaryScene, S.CreditsScene],
    };
    const game = new Phaser.Game(config);
    window.WFC_GAME = game;
    const refresh = () => window.requestAnimationFrame(() => game.scale.refresh());
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    refresh();
  }

  function boot() {
    if (window.WebFont) {
      let started = false;
      const go = () => { if (!started) { started = true; startGame(); } };
      window.WebFont.load({
        google: { families: ["Oswald:400,500,600,700", "Barlow Semi Condensed:400,500,600,700"] },
        active: go, inactive: go,
        timeout: 4000,
      });
      setTimeout(go, 4200); // hard fallback
    } else {
      startGame();
    }
  }

  window.addEventListener("load", boot);
})();
