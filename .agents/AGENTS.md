# Rogue: DungeonMaster Agent Guidelines

Guidelines and rules for modifying the Rogue: DungeonMaster codebase.

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

1. **Visual Theme**:
   - Maintain the radial dark background gradient (`#161622` to `#0c0c10`) and green-highlighted color scheme (`#4ade80`).
   - Use Outfit font for headers and descriptive stats, and Fira Code monospace font for raw data grid layouts, symbols, and logs.

2. **Aesthetic Transitions**:
   - Always add smooth micro-animations (`cubic-bezier` transitions, keyframe scale-ups, blur backdrops) for modals or panels to keep the design premium and cohesive.
