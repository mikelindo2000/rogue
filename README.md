# Rogue: DungeonMaster 🗡️

Welcome to **Rogue: DungeonMaster**, a modern, modular, browser-based turn-based roguelike game! Travel through 20 floors of dangerous dungeons, gather legendary loot, fight monsters, and challenge the final bosses.

---

## 🎮 How to Play (Keyboard Controls)

- **Move / Explore**: Use the **Arrow Keys** or **W, A, S, D**.
- **Run in a Direction**: Hold **Shift** with a movement key to keep moving until blocked, threatened, or at the end of a hall.
- **Search Nearby Walls**: Press **Space** near suspicious dead ends to look for hidden doors.
- **Read a Scroll**: Press **R** during play to read a carried scroll. Some deep rooms are **dark** — you see only the tiles right around you until you read a **Scroll of Light** to illuminate the whole room.
- **Monsters Compendium**: Press **M** to open the monsters codex to research stats and spawn floors.
- **Search Codex**: Type in the search box to filter monsters by name or symbol.
- **Close Menus**: Press **Escape** or click outside a menu/modal to close it.
- **Restart Game**: Press **R** (only works when the game is over or when you win).
- **Gear Up**: Use the dropdown controls in the top equipment panel to switch weapons, armor, shield, and drink potions.
- **Eat Food**: Click the **Eat** button in the equipment panel to reduce hunger fatigue.

---

## 🚀 How to Run the Game (For Everyone)

This game runs in your web browser, but needs a local server to run. Follow these steps to get it set up on your computer.

### Step 1: Install Node.js
To run the game server, you need a free utility called **Node.js**.
1. Go to the [Node.js Download Page](https://nodejs.org/).
2. Download the **LTS (Long Term Support)** version recommended for most users.
3. Open the downloaded installer and follow the standard installation steps (click "Next" until complete).

### Step 2: Open a Terminal in the Game Folder
You need to run command commands in the folder where this game is saved.

*   **On Windows**:
    1. Open the folder where this project is saved in **File Explorer**.
    2. Click on the address bar at the top of the file explorer window.
    3. Type `cmd` and press **Enter**. A black command window will open directly in the game folder.
*   **On macOS**:
    1. Open the **Terminal** app (press `Cmd + Space`, type "Terminal", and press Enter).
    2. Type `cd ` (with a space at the end).
    3. Drag the game's folder from Finder into the terminal window, then press **Enter**.

### Step 3: Run the Game Server
In your opened terminal window, type the following two commands:

1.  **Install dependencies** (only need to do this once):
    ```bash
    npm install
    ```
2.  **Start the local game server**:
    ```bash
    npm run dev
    ```
3.  After running the command, look at the screen for a local address, which usually looks like:
    ```
    http://localhost:5173/
    ```
4.  Copy that link or hold `Ctrl` (or `Cmd` on Mac) and click it to open the game in your favorite web browser!

---

## 🛠️ For Developers & Technical Users

This game is modularized using Vite, TypeScript, and native Web Components:
- **Build Output**: Run `npm run build` to generate static production assets inside `/dist`.
- **Custom Components**: Create new components in `src/components/` as HTML5 Custom Elements.
- **Keyboard Manager**: Central key events are handled under `src/keyboard.ts`. Avoid binding raw keyboard event listeners.

### Manual Trap Test Path

When running the Vite dev server, press `Ctrl+P` (`Cmd+P` on macOS) during gameplay to place a visible poison dart trap on a safe adjacent tile. Step onto the trap to verify the poison dart log, strength drain, and disorienting map-plane wobble/blur without hunting for a naturally generated trap.
