import { mount } from 'svelte';
import App from './ui/App.svelte';
import { ui, actions } from './ui/store.svelte';
import { GameUI } from './ui';
import { GameUiPresenterAdapter } from './presentation/gameUiPresenter';
import { GameEngine } from './engine';
import { loadConfig, getConfig, saveConfig } from './config';
import { KeyboardManager } from './keyboard';
import { clearSaveGame, loadSaveGame, saveSaveGame } from './persistence/savegame';
import {
  clearRunHistory,
  compareRunToRecords,
  computeRecords,
  loadRunHistory,
  upsertRunSummary,
} from './persistence/runHistory';
import { loadSettings, updateSettings } from './persistence/settings';
import { shouldShowIntro } from './introGate';
import { buildCopySummary } from './ui/endRunView';
import type { RunSummaryV1 } from './runStats';
import { createAudioService } from './audio/service';
import { createMusicService } from './audio/music';
import { selectMusicContext } from './audio/director';

document.addEventListener('DOMContentLoaded', () => {
  // Load configuration tunables first.
  loadConfig();
  ui.showSoundDebug = getConfig().showSoundDebug ?? false;

  // Mount the Svelte chrome so the canvas (#gameCanvas) exists before the
  // engine binds to it.
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app mount point');
  mount(App, { target: root });

  // Audio: build the browser sound service from persisted settings and inject
  // it into the engine. Mirror the muted/volume into the UI store so the
  // settings modal reflects the saved state. The service stays locked until the
  // first user gesture (autoplay policy), unlocked below.
  const settings = loadSettings();
  const audio = createAudioService(settings.audio);
  // Background music has its own channel/volume/mute and is driven by coarse
  // game-state context (below), not by SoundEvents.
  const music = createMusicService({ muted: settings.audio.musicMuted, volume: settings.audio.musicVolume });
  ui.audioMuted = settings.audio.muted;
  ui.audioVolume = settings.audio.volume;
  ui.musicMuted = settings.audio.musicMuted;
  ui.musicVolume = settings.audio.musicVolume;
  ui.boardSize = settings.boardSize;
  ui.floorTransition = settings.floorTransition;

  const ui_ = new GameUI('gameCanvas');
  const presenter = new GameUiPresenterAdapter(ui_);
  const engine = new GameEngine(presenter, audio);
  let presentationAnimationsEnabled = false;

  if (import.meta.env.DEV) {
    (window as Window & {
      __roguePreviewDeathTransition?: (id: string) => Promise<void>;
    }).__roguePreviewDeathTransition = (id: string) => ui_.previewDeathTransition(id);
    // Dev console helper: crank monster ability proc rates to witness the rare
    // 3%/1% abilities on demand. `rogueProcRate(20)` makes a 3% ability ~60%.
    // `rogueProcRate(1)` restores sheet rates. Persists via tunables.
    (window as Window & { rogueProcRate?: (mult: number) => number }).rogueProcRate = (mult: number) => {
      saveConfig({ ...getConfig(), abilityProcMultiplier: mult });
      console.info(`[rogue] ability proc multiplier set to ${mult} (1 = sheet rates)`);
      return mult;
    };
    // Dev console helper: drop a boss next to the player to witness the
    // boss-fight FX (stinger + crimson vignette + boss bar + map sway) without
    // grinding to floor 20. `rogueSpawnBoss('Marcus the Brave')` for the other.
    (window as Window & { rogueSpawnBoss?: (name?: string, hpFraction?: number) => void }).rogueSpawnBoss = (name?: string, hpFraction = 1) => {
      actions.devSpawnBoss(name, hpFraction);
      console.info(`[rogue] spawned boss${name ? ` (${name})` : ''} at ${Math.round(hpFraction * 100)}% HP beside the player`);
    };
  }

  // Both runtimes share one AudioContext; unlock them together on first gesture.
  const unlockAudio = () => {
    audio.unlock();
    music.unlock();
  };
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('pointerdown', unlockAudio, { once: true });

  // Map coarse game state to a music bed (pure logic in selectMusicContext).
  // setContext() ignores repeats and crossfades real changes.
  const updateMusic = () =>
    music.setContext(
      selectMusicContext({
        gameOver: engine.gameOver,
        gameWon: engine.gameWon,
        monsters: engine.monsters,
        dungeonFloor: engine.dungeonFloor,
      }),
    );

  const publishEndRunSummary = (summary: RunSummaryV1) => {
    const history = loadRunHistory();
    const historyWithoutCurrent = { runs: history.runs.filter(run => run.runId !== summary.runId) };
    const recordsBefore = computeRecords(historyWithoutCurrent);
    const comparison = compareRunToRecords(summary, recordsBefore);
    const updatedHistory = upsertRunSummary(summary);
    presenter.publishEndRunState({
      summary,
      comparison,
      history: updatedHistory.runs,
      records: computeRecords(updatedHistory),
    });
  };

  const openEndRunSummary = (summary: RunSummaryV1) => {
    publishEndRunSummary(summary);
    const animateDeath = presentationAnimationsEnabled && summary.outcome === 'died';
    if (!animateDeath) {
      presenter.publishEndRunState({ transitionActive: false, presentationReady: true });
      return;
    }

    presenter.publishEndRunState({ presentationReady: false, transitionActive: true });
    ui_.beginDeathTransition({
      outcome: summary.outcome,
      runId: summary.runId,
      floorReached: summary.floorReached,
      deathCause: summary.deathCause,
      killedByMonsterId: summary.killedByMonsterId,
    }).finally(() => {
      if (ui.endRunSummary?.runId !== summary.runId || !engine.gameOver || engine.gameWon) return;
      presenter.publishEndRunState({ transitionActive: false, presentationReady: true });
    });
  };

  // Autosave: trailing debounce around normal writes, plus an immediate flush
  // on tab close/hide. Wired before the initial load/restore so the fresh-run
  // autosave from initGame() (or restore path) is captured.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressedEndedRunId: string | null = null;
  const flushSave = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (
      suppressedEndedRunId &&
      (engine.gameOver || engine.gameWon) &&
      engine.stats.runId === suppressedEndedRunId
    ) {
      return;
    }
    // snapshot() only clones plain data, but guard the unload-path flush so a
    // stray throw can never block tab close.
    try {
      saveSaveGame(engine.snapshot());
    } catch (e) {
      console.error('Autosave snapshot failed', e);
    }
  };
  const scheduleSave = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  };
  engine.onRunChanged = () => {
    scheduleSave();
    updateMusic();
  };
  engine.onRunFinished = (summary) => {
    openEndRunSummary(summary);
    scheduleSave();
    updateMusic();
  };

  const save = loadSaveGame();
  if (!save || !engine.restore(save)) {
    // Fresh run: honour the chosen board size (a restored run keeps its own,
    // set inside engine.restore).
    engine.setBoardSize(settings.boardSize);
    engine.initGame();
    // Persist the fresh run immediately so a stale prior save can't be restored
    // if the tab is killed within the autosave debounce window.
    flushSave();
  }
  engine.draw();
  presentationAnimationsEnabled = true;
  // Select the opening bed (plays once audio unlocks on first input).
  updateMusic();

  window.addEventListener('beforeunload', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushSave();
    } else {
      // Resume the (possibly auto-suspended) audio context when the tab returns.
      audio.unlock();
      music.unlock();
    }
  });

  // Movement is suspended while any popover menu or modal dialog is open.
  const overlayOpen = () => ui.endRunTransitionActive || !!document.querySelector('[role="menu"], [role="dialog"]');

  // Wire the chrome's action hooks to the engine.
  actions.equip = (slot, value) => engine.equipGear(slot, value);
  actions.usePotion = (idx) => engine.usePotion(idx);
  actions.eat = () => engine.consumeFood();
  actions.moveOrAim = (dx, dy) => {
    if (overlayOpen()) return;
    if (engine.aiming) {
      engine.zapInDirection(dx, dy);
      syncAimingContext();
    } else {
      engine.handlePlayerMove(dx, dy);
    }
  };
  actions.run = (dx, dy) => {
    if (overlayOpen() || engine.aiming) return;
    engine.handlePlayerRun(dx, dy);
  };
  actions.search = () => {
    if (!overlayOpen()) engine.search();
  };
  actions.readScroll = () => {
    if (overlayOpen()) return;
    // No scrolls: let the engine log the "nothing to read" message.
    if (engine.player.inventory.scrolls.length === 0) {
      engine.readScroll();
      return;
    }
    // Otherwise open the scroll-focused chooser (inventory modal, first scroll
    // pre-selected) rather than blindly reading the first scroll — so a misread
    // never fires a harmful scroll. The modal's Read action does the deliberate
    // read via readScrollRef.
    const firstScroll = ui.inventoryItems.find(c => c.ref.kind === 'scroll');
    ui.inventoryFilterKind = 'scroll';
    actions.setInventoryOpen(true);
    if (firstScroll) ui.selectedInventoryRef = firstScroll.ref;
  };
  actions.drawFirstWand = () => {
    if (overlayOpen()) return;
    engine.drawFirstWand();
    syncAimingContext();
  };
  actions.restart = () => {
    if ((engine.gameOver || engine.gameWon) && !ui.endRunTransitionActive) {
      suppressedEndedRunId = null;
      presenter.resetEndRunState();
      ui_.resetDeathTransition();
      // Pick up any board-size change made since this run started.
      engine.setBoardSize(ui.boardSize);
      engine.initGame();
      engine.draw();
    }
  };
  // Abandon the current run and start fresh from the settings — the way to apply
  // a board-size change mid-run. Unlike restart() this works even while alive, so
  // the SettingsModal gates it behind an explicit confirm.
  actions.startNewGame = () => {
    suppressedEndedRunId = null;
    presenter.resetEndRunState();
    ui_.resetDeathTransition();
    ui.settingsOpen = false;
    engine.setBoardSize(ui.boardSize);
    engine.initGame();
    // Persist the fresh run immediately so a tab-kill can't restore the
    // abandoned one (mirrors the cold-start path).
    flushSave();
    engine.draw();
    updateMusic();
  };
  actions.setCompendiumOpen = (open) => {
    if (open) ui.potionMenuOpen = false;
    ui.compendiumOpen = open;
  };
  actions.setInventoryOpen = (open) => {
    if (open) ui.potionMenuOpen = false;
    ui.inventoryOpen = open;
    if (!open) {
      ui.inventoryFilterKind = 'all';
      // Clear the loadout focus so the next plain `i` opens neutrally.
      ui.selectedEquipSlot = null;
    }
    if (open && !ui.selectedInventoryRef) {
      ui.selectedInventoryRef = ui.inventoryItems[0]?.ref ?? null;
    }
  };
  actions.selectEquipSlot = (slot) => {
    ui.selectedEquipSlot = slot;
  };
  actions.setInventoryFilterKind = (kind) => {
    ui.inventoryFilterKind = kind;
    const visible = kind === 'scroll'
      ? ui.inventoryItems.filter(c => c.ref.kind === 'scroll')
      : ui.inventoryItems;
    ui.selectedInventoryRef = visible[0]?.ref ?? null;
  };
  actions.setPotionMenuOpen = (open) => {
    if (open && (overlayOpen() || ui.potions.length === 0)) return;
    ui.potionMenuOpen = open;
  };
  actions.setDebugPanelOpen = (open) => {
    if (open) ui.potionMenuOpen = false;
    ui.debugPanelOpen = open;
  };
  actions.setSettingsOpen = (open) => {
    if (open) ui.potionMenuOpen = false;
    ui.settingsOpen = open;
  };
  actions.setShortcutsOpen = (open) => {
    if (open) ui.potionMenuOpen = false;
    ui.shortcutsOpen = open;
  };
  actions.dismissIntro = () => {
    if (!ui.introOpen) return;
    ui.introOpen = false;
    // Game input was suspended while the gate was up; restore it now.
    keyboard.resume();
    // The dismissing gesture also unlocks audio (autoplay policy).
    unlockAudio();
    updateSettings({ hasSeenIntro: true });
  };
  actions.setAudioMuted = (muted) => {
    ui.audioMuted = muted;
    audio.setMuted(muted);
    updateSettings({ audio: { muted } });
  };
  actions.setAudioVolume = (volume) => {
    ui.audioVolume = volume;
    audio.setVolume(volume);
    updateSettings({ audio: { volume } });
  };
  actions.setMusicMuted = (muted) => {
    ui.musicMuted = muted;
    music.setMuted(muted);
    updateSettings({ audio: { musicMuted: muted } });
  };
  actions.setMusicVolume = (volume) => {
    ui.musicVolume = volume;
    music.setVolume(volume);
    updateSettings({ audio: { musicVolume: volume } });
  };
  actions.setBoardSize = (id) => {
    // Applies to the NEXT new game; the current run keeps its dimensions until
    // the player starts over (see the restart action below).
    ui.boardSize = id;
    updateSettings({ boardSize: id });
  };
  actions.setFloorTransition = (id) => {
    // Takes effect on the next floor change; GameUI reads ui.floorTransition.
    ui.floorTransition = id;
    updateSettings({ floorTransition: id });
  };
  actions.testSound = () => {
    audio.unlock();
    audio.test();
  };
  if (import.meta.env.DEV) {
    // Boss-fight FX tester (Dev tab + window.rogueSpawnBoss): drop a boss beside
    // the player without grinding to floor 20. Unlock audio so the stinger plays.
    actions.devSpawnBoss = (name?: string, hpFraction = 1) => {
      audio.unlock();
      engine.debugSpawnBoss(name, hpFraction);
    };
  }
  actions.copyEndRunSummary = () => {
    if (!ui.endRunSummary) return;
    const text = buildCopySummary(ui.endRunSummary, ui.endRunComparison);
    if (!navigator.clipboard?.writeText) {
      presenter.publishEndRunState({ copyStatus: 'Clipboard unavailable' });
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => {
        presenter.publishEndRunState({ copyStatus: 'Copied summary' });
      })
      .catch(() => {
        presenter.publishEndRunState({ copyStatus: 'Copy failed' });
      });
  };
  actions.clearRunHistory = () => {
    suppressedEndedRunId = ui.endRunSummary?.runId ?? null;
    clearRunHistory();
    clearSaveGame();
    const emptyRecords = computeRecords({ runs: [] });
    presenter.publishEndRunState({
      history: [],
      records: emptyRecords,
      comparison: ui.endRunSummary
        ? compareRunToRecords(ui.endRunSummary, emptyRecords)
        : null,
    });
  };
  actions.selectInventoryItem = (ref) => {
    ui.selectedInventoryRef = ref;
  };

  // Keyboard: all game shortcuts route through the centralized manager.
  const keyboard = new KeyboardManager();
  keyboard.setContextActive('game', true);

  // While a wand is drawn, direction keys must aim (not move), so 'game' and
  // 'aiming' are mutually exclusive. Re-sync after any action that may toggle
  // aiming, whether triggered by keyboard or pointer.
  const syncAimingContext = () => {
    const on = !!engine.aiming;
    keyboard.setContextActive('aiming', on);
    keyboard.setContextActive('game', !on);
  };

  actions.inventoryAction = (ref, action) => {
    if (action === 'zap' && ref.kind === 'wand') {
      // Close the inventory so the player can see the board to aim, then draw.
      ui.inventoryOpen = false;
      engine.beginZap(ref);
      syncAimingContext();
      return;
    }
    engine.performInventoryAction(ref, action);
  };
  actions.beginZap = (ref) => {
    engine.beginZap(ref);
    syncAimingContext();
  };
  actions.zapInDirection = (dx, dy) => {
    engine.zapInDirection(dx, dy);
    syncAimingContext();
  };
  actions.cancelZap = () => {
    engine.cancelZap();
    syncAimingContext();
  };

  const move = (dx: number, dy: number) => (e: KeyboardEvent) => {
    if (overlayOpen()) return;

    if (e.shiftKey) {
      engine.handlePlayerRun(dx, dy);
    } else {
      engine.handlePlayerMove(dx, dy);
    }
  };
  keyboard.register({ keys: ['w', 'ArrowUp'], description: 'Move/run up', context: 'game', callback: move(0, -1) });
  keyboard.register({ keys: ['s', 'ArrowDown'], description: 'Move/run down', context: 'game', callback: move(0, 1) });
  keyboard.register({ keys: ['a', 'ArrowLeft'], description: 'Move/run left', context: 'game', callback: move(-1, 0) });
  keyboard.register({ keys: ['d', 'ArrowRight'], description: 'Move/run right', context: 'game', callback: move(1, 0) });

  keyboard.register({
    keys: ['e'],
    description: 'Eat rations',
    context: 'game',
    callback: () => {
      if (!overlayOpen()) engine.consumeFood();
    },
  });

  keyboard.register({
    keys: [' '],
    description: 'Search nearby walls',
    context: 'game',
    callback: () => {
      if (!overlayOpen()) engine.search();
    },
  });

  keyboard.register({
    keys: ['r'],
    description: 'Read a scroll (Restart when the run has ended)',
    context: 'game',
    callback: () => {
      // Context-gated: restart only matters once the run is over, so during
      // active play 'r' opens the scroll chooser (the Rogue "read" verb).
      if (engine.gameOver || engine.gameWon) {
        if (!ui.endRunTransitionActive) actions.restart();
      } else {
        actions.readScroll();
      }
    },
  });

  keyboard.register({
    keys: ['q'],
    description: 'Quaff a potion',
    context: 'game',
    callback: () => {
      actions.setPotionMenuOpen(true);
    },
  });

  keyboard.register({
    keys: ['z'],
    description: 'Zap a wand',
    context: 'game',
    callback: () => {
      if (overlayOpen()) return;
      engine.drawFirstWand();
      syncAimingContext();
    },
  });

  // Aiming context: while a wand is drawn, the movement keys become aim keys and
  // Escape cancels. 'game' is suspended (see syncAimingContext), so these win.
  const aim = (dx: number, dy: number) => () => {
    engine.zapInDirection(dx, dy);
    syncAimingContext();
  };
  keyboard.register({ keys: ['w', 'ArrowUp'], description: 'Zap up', context: 'aiming', callback: aim(0, -1) });
  keyboard.register({ keys: ['s', 'ArrowDown'], description: 'Zap down', context: 'aiming', callback: aim(0, 1) });
  keyboard.register({ keys: ['a', 'ArrowLeft'], description: 'Zap left', context: 'aiming', callback: aim(-1, 0) });
  keyboard.register({ keys: ['d', 'ArrowRight'], description: 'Zap right', context: 'aiming', callback: aim(1, 0) });
  keyboard.register({
    keys: ['Escape'],
    description: 'Cancel aiming',
    context: 'aiming',
    callback: () => {
      engine.cancelZap();
      syncAimingContext();
    },
  });

  keyboard.register({
    keys: ['i'],
    description: 'Toggle inventory',
    context: 'game',
    callback: () => {
      if (ui.inventoryOpen || !overlayOpen()) {
        actions.setInventoryOpen(!ui.inventoryOpen);
      }
    },
  });

  keyboard.register({
    keys: ['c'],
    description: 'Open loadout (equipment)',
    context: 'game',
    callback: () => {
      if (ui.inventoryOpen) {
        actions.setInventoryOpen(false);
        return;
      }
      if (overlayOpen()) return;
      // Land on the equipment spine rather than the pack.
      actions.selectEquipSlot(ui.equipment[0]?.slot ?? 'mainHand');
      actions.setInventoryOpen(true);
    },
  });

  keyboard.register({
    keys: ['m'],
    description: 'Toggle the bestiary',
    context: 'game',
    callback: () => {
      // Allow closing the bestiary; only block opening it over another overlay.
      if (ui.compendiumOpen || !overlayOpen()) {
        ui.compendiumOpen = !ui.compendiumOpen;
      }
    },
  });

  keyboard.register({
    keys: ['b'],
    description: 'Toggle the debug panel (dev)',
    context: 'game',
    ctrlOrMeta: true,
    hidden: true,
    callback: () => {
      if (ui.debugPanelOpen || !overlayOpen()) {
        ui.debugPanelOpen = !ui.debugPanelOpen;
      }
    },
  });

  if (import.meta.env.DEV) {
    keyboard.register({
      keys: ['p'],
      description: 'Place a poison dart trap (dev)',
      context: 'game',
      ctrlOrMeta: true,
      hidden: true,
      callback: () => {
        if (overlayOpen()) return;
        engine.debugPlacePoisonDartTrap();
      },
    });
  }

  keyboard.register({
    keys: [','],
    description: 'Toggle settings',
    context: 'game',
    callback: () => {
      // Allow closing settings from the key; only block opening it over another overlay.
      if (ui.settingsOpen || !overlayOpen()) {
        actions.setSettingsOpen(!ui.settingsOpen);
      }
    },
  });

  keyboard.register({
    keys: ['?'],
    description: 'Show all shortcuts',
    context: 'game',
    callback: () => {
      // Allow closing from the key; only block opening it over another overlay.
      if (ui.shortcutsOpen || !overlayOpen()) {
        actions.setShortcutsOpen(!ui.shortcutsOpen);
      }
    },
  });

  // Publish the registered bindings so the shortcuts modal and How-to-Play guide
  // render from one source of truth instead of a hand-maintained duplicate.
  ui.shortcuts = keyboard.list();

  // First-run How-to-Play gate: shown only to a brand-new visitor (no save and
  // never dismissed). While it's up, suspend game input so keys don't leak to
  // the board underneath; dismissIntro() resumes it.
  if (shouldShowIntro(!!save, settings.hasSeenIntro)) {
    ui.introOpen = true;
    keyboard.suspend();
  }
});
