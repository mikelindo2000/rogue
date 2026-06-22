import { GameUI } from './ui';
import { GameEngine } from './engine';
import { loadConfig } from './config';
import { KeyboardManager } from './keyboard';
import { GAME_EVENTS } from './events';
import { EquipSlot } from './types';
import './components/monster-compendium';
import './components/game-select';

document.addEventListener('DOMContentLoaded', () => {
  // Load configuration tunables first
  loadConfig();

  // Create UI and Engine instances
  const ui = new GameUI('gameCanvas', 'message-log');
  const engine = new GameEngine(ui);

  // Initialize engine
  engine.initGame();
  engine.draw();

  // Setup Monsters Compendium reference
  const compendium = document.getElementById('compendium') as any;

  // Initialize Keyboard Manager and register contexts
  const keyboard = new KeyboardManager();
  keyboard.setContextActive('game', true);
  keyboard.setContextActive('modal', false);

  // Track open overlays (modals + custom dropdowns) so movement keys are
  // suspended while the player is interacting with a menu.
  let modalCount = 0;
  let dropdownCount = 0;
  const syncContexts = () => {
    keyboard.setContextActive('modal', modalCount > 0);
    keyboard.setContextActive('game', modalCount === 0 && dropdownCount === 0);
  };

  document.addEventListener(GAME_EVENTS.MODAL_STATE_CHANGE, (e: any) => {
    modalCount = Math.max(0, modalCount + (e.detail.open ? 1 : -1));
    syncContexts();
  });

  document.addEventListener(GAME_EVENTS.DROPDOWN_STATE_CHANGE, (e: any) => {
    dropdownCount = Math.max(0, dropdownCount + (e.detail.open ? 1 : -1));
    syncContexts();
  });

  // Register Game Movement bindings
  keyboard.register({
    keys: ['w', 'ArrowUp'],
    description: 'Move Up',
    context: 'game',
    callback: () => engine.handlePlayerMove(0, -1)
  });
  keyboard.register({
    keys: ['s', 'ArrowDown'],
    description: 'Move Down',
    context: 'game',
    callback: () => engine.handlePlayerMove(0, 1)
  });
  keyboard.register({
    keys: ['a', 'ArrowLeft'],
    description: 'Move Left',
    context: 'game',
    callback: () => engine.handlePlayerMove(-1, 0)
  });
  keyboard.register({
    keys: ['d', 'ArrowRight'],
    description: 'Move Right',
    context: 'game',
    callback: () => engine.handlePlayerMove(1, 0)
  });

  // Reset Game binding (active during game-over state check)
  keyboard.register({
    keys: ['r'],
    description: 'Restart Game',
    context: 'game',
    callback: () => {
      if (engine.gameOver || engine.gameWon) {
        engine.initGame();
        engine.draw();
      }
    }
  });

  // Toggle Monsters Compendium
  keyboard.register({
    keys: ['m'],
    description: 'Toggle Monsters Compendium',
    context: 'game',
    callback: () => {
      if (compendium) {
        compendium.toggle();
      }
    }
  });

  // Close active modals using Escape
  keyboard.register({
    keys: ['Escape'],
    description: 'Close Modal',
    context: 'modal',
    callback: () => {
      if (compendium) {
        compendium.close();
      }
    }
  });

  // Hook drop-down selections
  const bindEquipSelector = (id: string, slot: EquipSlot) => {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (el) {
      el.addEventListener('change', () => {
        engine.equipGear(slot, el.value);
        el.blur(); // Blur so arrow keys navigate the game instead of the dropdown
      });
    }
  };

  bindEquipSelector('sel-main', 'mainHand');
  bindEquipSelector('sel-off', 'offHand');
  bindEquipSelector('sel-helm', 'helm');
  bindEquipSelector('sel-chest', 'chest');
  bindEquipSelector('sel-legs', 'legs');
  bindEquipSelector('sel-gauntlets', 'gauntlets');
  bindEquipSelector('sel-boots', 'boots');

  // Potion usage selector
  const selPotions = document.getElementById('sel-potions') as HTMLSelectElement;
  if (selPotions) {
    selPotions.addEventListener('change', () => {
      const idx = parseInt(selPotions.value);
      if (!isNaN(idx)) {
        engine.usePotion(idx);
      }
      selPotions.blur();
    });
  }

  // Food consumption button
  const btnEat = document.getElementById('btn-eat') as HTMLButtonElement;
  if (btnEat) {
    btnEat.addEventListener('click', () => {
      engine.consumeFood();
      btnEat.blur();
    });
  }
});

