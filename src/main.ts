import { mount } from 'svelte';
import App from './ui/App.svelte';
import { ui, actions } from './ui/store.svelte';
import { GameUI } from './ui';
import { GameEngine } from './engine';
import { loadConfig } from './config';
import { KeyboardManager } from './keyboard';
import { loadSaveGame, saveSaveGame } from './persistence/savegame';
import { loadSettings, updateSettings } from './persistence/settings';
import { createAudioService } from './audio/service';
import { createMusicService } from './audio/music';
import type { MusicContextId } from './audio/manifest';

document.addEventListener('DOMContentLoaded', () => {
  // Load configuration tunables first.
  loadConfig();

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

  const ui_ = new GameUI('gameCanvas');
  const engine = new GameEngine(ui_, audio);

  // Both runtimes share one AudioContext; unlock them together on first gesture.
  const unlockAudio = () => {
    audio.unlock();
    music.unlock();
  };
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('pointerdown', unlockAudio, { once: true });

  // Map coarse game state to a music bed. Bosses win, then a cleared floor is a
  // respite, then depth selects the explore theme; run end plays the game-over
  // bed. setContext() ignores repeats and crossfades real changes.
  const musicContextFor = (): MusicContextId | null => {
    if (engine.gameOver || engine.gameWon) return 'gameover';
    if (engine.monsters.some((m) => m.special === 'boss')) return 'boss';
    if (engine.monsters.length === 0) return 'safe';
    return engine.dungeonFloor <= 3 ? 'explore-shallow' : 'explore-deep';
  };
  const updateMusic = () => music.setContext(musicContextFor());

  // Autosave: trailing debounce around normal writes, plus an immediate flush
  // on tab close/hide. Wired before the initial load/restore so the fresh-run
  // autosave from initGame() (or restore path) is captured.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const flushSave = () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
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

  const save = loadSaveGame();
  if (!save || !engine.restore(save)) {
    engine.initGame();
    // Persist the fresh run immediately so a stale prior save can't be restored
    // if the tab is killed within the autosave debounce window.
    flushSave();
  }
  engine.draw();
  // Select the opening bed (plays once audio unlocks on first input).
  updateMusic();

  window.addEventListener('beforeunload', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });

  // Movement is suspended while any popover menu or modal dialog is open.
  const overlayOpen = () => !!document.querySelector('[role="menu"], [role="dialog"]');

  // Wire the chrome's action hooks to the engine.
  actions.equip = (slot, value) => engine.equipGear(slot, value);
  actions.usePotion = (idx) => engine.usePotion(idx);
  actions.eat = () => engine.consumeFood();
  actions.restart = () => {
    if (engine.gameOver || engine.gameWon) {
      engine.initGame();
      engine.draw();
    }
  };
  actions.setCompendiumOpen = (open) => {
    ui.compendiumOpen = open;
  };
  actions.setInventoryOpen = (open) => {
    ui.inventoryOpen = open;
    if (open && !ui.selectedInventoryRef) {
      ui.selectedInventoryRef = ui.inventoryItems[0]?.ref ?? null;
    }
  };
  actions.setBalancePanelOpen = (open) => {
    ui.balancePanelOpen = open;
  };
  actions.setSettingsOpen = (open) => {
    ui.settingsOpen = open;
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
  actions.testSound = () => {
    audio.unlock();
    audio.test();
  };
  actions.selectInventoryItem = (ref) => {
    ui.selectedInventoryRef = ref;
  };
  actions.inventoryAction = (ref, action) => {
    engine.performInventoryAction(ref, action);
  };

  // Keyboard: all game shortcuts route through the centralized manager.
  const keyboard = new KeyboardManager();
  keyboard.setContextActive('game', true);

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
    description: 'Restart (when the run has ended)',
    context: 'game',
    callback: () => actions.restart(),
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
    description: 'Toggle the balance report (dev)',
    context: 'game',
    ctrlOrMeta: true,
    callback: () => {
      if (ui.balancePanelOpen || !overlayOpen()) {
        ui.balancePanelOpen = !ui.balancePanelOpen;
      }
    },
  });

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
});
