import { GameUI } from './ui';
import { GameEngine } from './engine';
import { loadConfig } from './config';
import { setupKeyboardControls } from './controls';

document.addEventListener('DOMContentLoaded', () => {
  // Load configuration tunables first
  loadConfig();

  // Create UI and Engine instances
  const ui = new GameUI('gameCanvas', 'message-log');
  const engine = new GameEngine(ui);

  // Initialize engine
  engine.initGame();
  engine.draw();

  // Setup keyboard controls
  setupKeyboardControls(engine);

  // Hook drop-down selections
  const bindEquipSelector = (id: string, slot: string) => {
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
