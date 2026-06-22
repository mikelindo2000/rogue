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

The UI chrome (everything around the dungeon canvas) is built in **Svelte 5**.
The dungeon board itself stays on `<canvas>` and is rendered imperatively by
`GameUI.render()` — do not move the board into Svelte or change how it draws.

1. **Svelte 5, runes, light components**:
   - Build reusable UI in `src/ui/components/` (shared building blocks in
     `src/ui/components/primitives/`). Use runes: `$props()`, `$state`,
     `$derived`, `$effect`. Use the `onclick=` event syntax (not `on:click`).
   - Keep components small and token-driven (see Styling Guidelines). The
     composition root is `src/ui/App.svelte`, mounted in `src/main.ts`.
   - Avoid heavier UI frameworks (React/Vue/Angular). Svelte compiles away; the
     reactive layer only drives once-per-turn HUD chrome, never the canvas loop.

2. **Engine ↔ UI state bridge** (`src/ui/store.svelte.ts`):
   - The engine is the imperative source of truth. After each turn it pushes a
     plain snapshot into the reactive `ui` object via `GameUI`
     (`updateStats`/`updateDropdowns`/`renderLogs`), and components render from
     it. Mutating `ui`'s properties / reassigning its arrays is reactive across
     modules — no manual subscriptions.
   - User actions flow the other way through `actions` (equip/usePotion/eat/…),
     wired to engine methods in `src/main.ts`. Add new HUD data as fields on
     `UIState`; add new side effects as `actions` hooks.

3. **Design = source of truth**: components are implemented from the Claude
   Design project (see `design/SPEC.md`). When changing the look, update the
   tokens/components to match the design rather than hardcoding values.

---

## Keyboard Input & Controls

1. **Centralized Keyboard Handler**:
   - Do **NOT** bind direct `keydown` event listeners to the window or document for game actions.
   - Always register key shortcuts with the global `KeyboardManager` instance created in `src/main.ts`.

2. **Overlay suspension**:
   - Movement/action shortcuts no-op while a menu or modal is open. `src/main.ts`
     guards them with `overlayOpen()`, which checks for an open
     `[role="menu"]` (Popover) or `[role="dialog"]` (Modal). Give any new overlay
     one of those roles so it suspends the game automatically.

3. **Form Input Focus Safety**:
   - `KeyboardManager` automatically filters out shortcuts when typing inside form elements (like input search fields), except for the `Escape` key which is allowed to bubble or trigger close actions. Keep this behavior intact when adding fields.

---

## Styling Guidelines

1. **Tokens + scoped styles**:
   - `src/styles.css` only imports `src/ui/styles/global.css` (fonts, reset,
     body, scrollbars), which in turn imports `src/ui/styles/tokens.css`.
   - Per-component styling lives in each `.svelte` file's scoped `<style>` block.
     There is no global per-component CSS file anymore.

2. **Design Tokens**:
   - All chrome colors, fonts, radii, spacing, shadows, and easing are CSS custom
     properties in `:root` (`src/ui/styles/tokens.css`), extracted from the
     design. Reference them (`var(--surface-rail)`, `var(--accent)`,
     `var(--r-md)`, `var(--ease)`, …) — never hardcode a hex value. The only
     acceptable raw colors are black scrims/shadows and `color-mix()` over a
     token; data-driven colors (monster/rarity colors from the store) are passed
     through as values.
   - Canvas (dungeon) colors can't live in CSS; they stay centralized in
     `src/theme.ts` with the tile vocabulary in `src/tiles.ts`. Do not retheme
     the board here.

3. **Visual Theme**:
   - Dark surfaces with an amber/gold accent (`var(--accent)`), `Geist` for body
     text and `Space Grotesk` for headings/numbers (tabular). The dungeon view
     still follows the original Rogue board (rooms with `-`/`|` walls, `.` floor,
     `#` corridors, `+` doors) — unchanged.

4. **Accessibility & motion**:
   - Interactive elements are real `<button>`s with `aria-label`s; bars use
     `role="progressbar"` with aria values; decorative SVG is `aria-hidden`.
     A global `:focus-visible` ring (`--focus-ring`) covers keyboard focus —
     don't `outline: none` without a visible replacement.
   - Keep micro-animations (cubic-bezier transitions, scale-ups, blur backdrops)
     for menus/modals/panels. Reduced-motion is handled globally in `global.css`.

## Bestiary Art

- Generated monster art lives in `public/bestiary/<monster-id>.png`, where
  `<monster-id>` must match `monsterId()` / the slug fallback in
  `src/discovery.ts`.
- Regenerate future monster images from the recipe in
  `design/MONSTER_IMAGE_GENERATION.md`. Do not assume any particular wrapper
  CLI or another repo exists on a developer's machine; use any available image
  generator that can match the documented model/style/params and output paths.
- Keep bestiary images as dark, text-free, centered creature portraits so they
  remain legible as card backgrounds and behind the sparring preview.
