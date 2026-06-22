# Rogue: DungeonMaster Agent Guidelines

Guidelines and rules for modifying the Rogue: DungeonMaster codebase.

## Version Control

1. **Commit as you work**:
   - Make small, focused commits as you complete coherent units of work
     (a feature, a refactor, a fix) rather than one giant commit at the end.
   - Run `npx tsc --noEmit` (or `npm run build`) before committing so every
     commit type-checks and builds.

2. **Commit messages**:
   - Write a concise imperative subject line describing the change
     (e.g. "Add custom dropdown component", "Render classic Rogue walls").
   - Add a short body when the *why* isn't obvious from the subject.

3. **Pre-commit hook**:
   - A repo hook runs `npm run check` before each commit. Enable it once per
     clone: `git config core.hooksPath .githooks`.

---

## Testing & Determinism

1. **Run `npm run check`** (`tsc --noEmit && vitest run`) before committing.
   `npm test` watches; `npm run test:run` runs once.

2. **Seedable RNG**: game logic draws randomness from an injected `RNG`
   (`src/rng.ts`), never `Math.random()` directly. Generation, loot, and combat
   take an `rng` parameter. This keeps everything reproducible — when adding a
   randomized system, thread the `rng` through rather than reaching for
   `Math.random()`.

3. **Test the pure core**: combat math (`src/combat.ts`), loot
   (`src/items.ts`), leveling (`src/player.ts`), and map generation
   (`src/map.ts`) are pure/seedable and have unit tests in `src/*.test.ts`.
   When changing balance or generation, add/adjust a test. Derive expected
   values from `BALANCE` (see below) instead of hardcoding, so tests survive
   retuning.

4. **Keep logic pure where practical**: prefer functions that take state +
   `rng` and return a result (the engine applies it) over functions that mutate
   and log inline. Pure functions are what the test suite can pin down.

5. **Assert invariants, fail loud**: use `assert(cond, msg)` from `src/assert.ts`
   for cheap conditions that must always hold (e.g. the generator asserts a room
   was placed and the player/stairs land on walkable tiles). Use
   `devAssert(() => check(), msg)` for deeper/expensive checks that should run in
   dev and tests but never risk throwing in a player's production session (e.g.
   the map generator's reachability flood-fill). A violated invariant should
   surface immediately, not corrupt state for a later mysterious crash.

---

## Game Balance

All game-balance settings are centralized in [config.ts](file:///Users/marcus/code/rogue/src/config.ts). Do not hardcode magic numbers in game logic.

### 1. Where Balance Files Live
- **Static Constants**: Designer-set constants (spawn rates, room sizes, combat formulas, status durations, loot scaling, FOV) live in the `BALANCE` object in `src/config.ts`.
- **Tunable Configuration**: Player-adjustable values (sliders/knobs) live in `TunableConfig` and `DEFAULT_TUNABLES` in `src/config.ts`.
- **Monster Database**: Base stats, floor requirements, symbols, colors, and special tags (e.g. `'boss'`) for all monsters are defined in `MONSTER_DATABASE`.
- **Gear Pool**: Item stats (defense, damage, category, rarity) are defined in `GEAR_POOL`.

### 2. How to Make Adjustments

#### A. Adjusting Static Values
If you need to change a core game balance constant (e.g. food spawn rate, level-up HP multiplier, trap damage):
1. Locate the setting inside the `BALANCE` object in `src/config.ts` and modify it.
2. Ensure that any relevant unit tests (e.g. in `src/combat.test.ts` or `src/map.test.ts`) are updated to reflect the new expected outcomes (prefer deriving assertions from `BALANCE` instead of hardcoding).

#### B. Adding a New Tunable Slider
To add a new setting that players can adjust dynamically:
1. Define the property type in the `TunableConfig` interface in `src/config.ts`.
2. Provide a default value in the `DEFAULT_TUNABLES` object in `src/config.ts`.
3. If the setting alters already-spawned game objects or player state (like starting HP), add logic to handle it in `handleBalanceUpdate()` within `src/engine.ts`.
4. Update the visual tweaking panel HTML and events to render the new slider and bind it to `saveConfig`.

#### C. Special Monster Overrides (e.g., Tutorial/Floor 1 Spawns)
- If a high-level monster or boss (such as `Marcus the Brave`) is spawned on a lower floor for testing/tutorial purposes, **do not** nerf their base stats in `MONSTER_DATABASE` (as that would weaken them on their normal depths).
- Instead, scale their stats down dynamically at spawn-time within [map.ts](file:///Users/marcus/code/rogue/src/map.ts) (e.g., overriding `hp` and `atk` fields when pushed to the `monsters` list).

#### D. Verifying and Testing Changes
- After any balance adjustment, run `npm run check` (`tsc --noEmit && vitest run`) to ensure no type errors or broken test assertions were introduced.
- If a formula changes, update the corresponding tests (e.g. in `src/combat.test.ts` or `src/leveling.test.ts`) to maintain 100% coverage of pure mechanics.

---

## UI Component Architecture

1. **Native Web Components Only**:
   - Avoid introducing React, Vue, Angular, or other heavy runtime libraries.
   - Build reusable UI parts as Custom Elements (`window.customElements.define`) in the `src/components/` directory.

2. **Light DOM vs. Shadow DOM**:
   - Use Light DOM (direct `innerHTML` modification without creating a Shadow Root) for custom elements that need to share the main CSS stylesheet rules, theme variables, and global fonts defined in `src/styles.css`.
   - Ensure you guard `connectedCallback()` rendering with a `rendered` boolean flag to prevent duplicate initialization loops.

3. **Event Communication**:
   - Custom components should communicate state transitions (e.g. open/close) to the application engine by dispatching bubbling `CustomEvent`s.

---

## Keyboard Input & Controls

1. **Centralized Keyboard Handler**:
   - Do **NOT** bind direct `keydown` event listeners to the window or document for game actions.
   - Always register key shortcuts with the global `KeyboardManager` instance created in `src/main.ts`.

2. **Binding Contexts**:
   - Assign bindings to distinct contexts: `'game'` (normal exploration), `'modal'` (active menu overlays), or `'global'`.
   - Active contexts must be toggled on state changes (e.g., when a modal opens, deactivate `'game'` and activate `'modal'`).

3. **Form Input Focus Safety**:
   - `KeyboardManager` automatically filters out shortcuts when typing inside form elements (like input search fields), except for the `Escape` key which is allowed to bubble or trigger close actions. Keep this behavior intact when adding fields.

---

## Styling Guidelines

1. **Modular CSS**:
   - `src/styles.css` is an entry point that only `@import`s the font and the
     modules in `src/styles/`. Each concern lives in its own file:
     `base.css` (design tokens + body), `layout.css`, `hud.css`, `canvas.css`,
     `dropdown.css`, `modal.css`, `compendium.css`.
   - Add new component styles as a new file in `src/styles/` and import it from
     `styles.css`. Keep rules grouped by the component they style.

2. **Design Tokens**:
   - Colors, fonts, radii, and easing curves are defined as CSS custom
     properties in `:root` (`src/styles/base.css`). Reference them
     (`var(--phosphor)`, `var(--border)`, `var(--ease)`, etc.) instead of
     hardcoding hex values, so the theme stays centralized.
   - Canvas (dungeon) colors can't live in CSS; they are centralized in
     `src/theme.ts` and the tile vocabulary in `src/tiles.ts`.

3. **Visual Theme**:
   - Maintain the radial dark background gradient and green-phosphor accent
     (`var(--phosphor)`). The dungeon view follows the original Rogue: rooms
     bounded by `-`/`|` walls with `.` floor, dark `#` corridors, `+` doors.
   - Use Outfit font for headers and descriptive stats, and Fira Code monospace
     font for raw data grid layouts, symbols, and logs.

4. **Aesthetic Transitions**:
   - Always add smooth micro-animations (`cubic-bezier` transitions, keyframe
     scale-ups, blur backdrops) for modals, panels, or dropdowns to keep the
     design premium and cohesive.
