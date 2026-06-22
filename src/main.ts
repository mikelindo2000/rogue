import { mount } from 'svelte';
import App from './ui/App.svelte';
import { ui, actions } from './ui/store.svelte';
import { GameUI } from './ui';
import { GameEngine } from './engine';
import { loadConfig } from './config';
import { KeyboardManager } from './keyboard';

document.addEventListener('DOMContentLoaded', () => {
  // Load configuration tunables first.
  loadConfig();

  // Mount the Svelte chrome so the canvas (#gameCanvas) exists before the
  // engine binds to it.
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app mount point');
  mount(App, { target: root });

  const ui_ = new GameUI('gameCanvas');
  const engine = new GameEngine(ui_);
  engine.initGame();
  engine.draw();

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

  // Keyboard: all game shortcuts route through the centralized manager.
  const keyboard = new KeyboardManager();
  keyboard.setContextActive('game', true);

  const RUN_DOUBLE_TAP_MS = 260;
  let lastMove: { key: string; at: number } | null = null;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const move = (dx: number, dy: number, key: string) => (e: KeyboardEvent) => {
    if (overlayOpen()) return;

    const now = nowMs();
    const doubleTapped = !e.repeat && lastMove?.key === key && now - lastMove.at <= RUN_DOUBLE_TAP_MS;
    const shouldRun = e.shiftKey || doubleTapped;
    lastMove = shouldRun ? null : { key, at: now };

    if (shouldRun) {
      engine.handlePlayerRun(dx, dy);
    } else {
      engine.handlePlayerMove(dx, dy);
    }
  };
  keyboard.register({ keys: ['w', 'ArrowUp'], description: 'Move/run up', context: 'game', callback: move(0, -1, 'up') });
  keyboard.register({ keys: ['s', 'ArrowDown'], description: 'Move/run down', context: 'game', callback: move(0, 1, 'down') });
  keyboard.register({ keys: ['a', 'ArrowLeft'], description: 'Move/run left', context: 'game', callback: move(-1, 0, 'left') });
  keyboard.register({ keys: ['d', 'ArrowRight'], description: 'Move/run right', context: 'game', callback: move(1, 0, 'right') });

  keyboard.register({
    keys: ['e'],
    description: 'Eat rations',
    context: 'game',
    callback: () => {
      if (!overlayOpen()) engine.consumeFood();
    },
  });

  keyboard.register({
    keys: ['r'],
    description: 'Restart (when the run has ended)',
    context: 'game',
    callback: () => actions.restart(),
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
});
