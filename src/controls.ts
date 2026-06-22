import { GameEngine } from './engine';

export function setupKeyboardControls(engine: GameEngine) {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (engine.gameOver || engine.gameWon) {
      if (e.key === 'r' || e.key === 'R') {
        engine.initGame();
        engine.draw();
      }
      return;
    }

    let dx = 0;
    let dy = 0;

    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        dy = -1;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        dy = 1;
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        dx = -1;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        dx = 1;
        break;
      default:
        return; // Ignore other keys
    }

    e.preventDefault();
    engine.handlePlayerMove(dx, dy);
  });
}
