# Scroll Authoring Guide

How to add, tune, test, and ship a scroll without rediscovering the whole scroll
pipeline.

> TL;DR: scroll metadata is data in `src/scrolls.ts`; effect execution is code in
> `src/engine.ts`; visuals are split between compact SVG-ish icons in
> `src/ui/icons.ts` and generated 512px PNGs in `public/inventory/`. Add tests,
> run `npm run check`, and never mutate FOV unless the scroll is genuinely a
> sight mechanic.

## Quick Start

For a no-target scroll with an immediate effect:

1. Add the type to `ScrollType` in `src/types.ts`.
2. Add it to `SCROLL_TYPES` and `SCROLL_VISUALS` in `src/itemVisuals.ts`.
3. Add its compact icon path in `src/ui/icons.ts`.
4. Add its `SCROLLS` definition and spawn weights in `src/scrolls.ts`.
5. Implement its `case` in `GameEngine.applyScrollEffect()` in `src/engine.ts`.
6. Add or generate `public/inventory/scroll-of-<slug>.png`.
7. Add tests in `src/scrolls.test.ts`, `src/engine.scrolls.test.ts`, and any
   save/UI test touched by the effect.
8. Run `npm run check`.

Example type and visual entries:

```ts
// src/types.ts
export type ScrollType =
  | 'light'
  | 'my_new_scroll';

// src/itemVisuals.ts
export const SCROLL_TYPES = [
  'light',
  'my_new_scroll',
] as const satisfies readonly ScrollType[];

export const SCROLL_VISUALS: Record<ScrollType, ScrollVisual> = {
  light: { icon: 'scroll-light', mapColor: '#ffd86b', uiColor: 'var(--scroll-light)', accent: 'warm-gold' },
  my_new_scroll: { icon: 'scroll-my_new_scroll', mapColor: '#66e0c2', uiColor: '#66e0c2', accent: 'teal' },
};
```

## Architecture Map

| File | What it owns |
| --- | --- |
| `src/types.ts` | `ScrollType`, `Inventory.scrolls`, floor item shape, shared status types. |
| `src/scrolls.ts` | Scroll registry, display names, implemented-scroll gate, spawn weights. No side effects. |
| `src/itemVisuals.ts` | Ordered scroll list and visual color/icon metadata. |
| `src/ui/icons.ts` | Compact line icons used in buttons, inventory cells, and log mentions. |
| `src/ui/inventoryArt.ts` | Slug rule for full PNG inventory art. Usually no edits. |
| `public/inventory/` | Generated 512px item art. Every `SCROLL_TYPES` entry needs a matching PNG. |
| `src/engine.ts` | Effect execution, logging, consumption/no-op behavior, status counters. |
| `src/persistence/savegame.ts` | Save validation and migration if the scroll adds persisted state. |
| `src/ui.ts` | Canvas rendering only when an effect needs a new map presentation layer. |
| `src/ui/itemMention.ts` | Log mention enrichment. It derives scroll mentions from `SCROLL_TYPES`. |
| `design/implemented/inventory_image_generation.md` | Reproducible art prompt table. |
| `scripts/gen-scroll-art.sh` | Deterministic local art generation for the scroll line. |

## Registry Rules

Every scroll gets one `ScrollDefinition` in `SCROLLS`:

```ts
my_new_scroll: {
  type: 'my_new_scroll',
  name: 'My New Scroll',
  scrollOf: true,
  summary: 'Short inventory-list sentence.',
  detail: 'Longer detail-pane sentence that explains timing and limits.',
  minFloor: 5,
  rarity: 'uncommon',
  harmful: false,
  needsTarget: 'none',
  noOpKeepsScroll: false,
},
```

Use `noOpKeepsScroll: true` only when the player could reasonably foresee the
no-op and should not lose a turn or item, such as Light in a lit room, Magic
Mapping on a fully mapped floor, or Enchant Weapon with no weapon.

Use `noOpKeepsScroll: false` for detection, risk, dud, and tactical scrolls where
"nothing useful was found" is still the outcome of reading the scroll.

## Spawn Tuning

Add the scroll to `SCROLL_TUNING` only when its effect is implemented and ready
to spawn. Then add it to `IMPLEMENTED_SCROLLS`.

```ts
export const SCROLL_TUNING: Partial<Record<ScrollType, ScrollSpawnTuning>> = {
  my_new_scroll: { role: 'situational', early: 0, mid: 3, deep: 4 },
};

export const IMPLEMENTED_SCROLLS: ReadonlySet<ScrollType> = new Set<ScrollType>([
  'my_new_scroll',
]);
```

Roles:

| Role | Use it for | Spawn guidance |
| --- | --- | --- |
| `core` | Broadly useful survival/build tools. | Can be common in every eligible band. |
| `situational` | Detection or context-dependent tools. | Moderate weights; avoid pack clutter. |
| `risky` | Bad or dangerous scrolls. | Rare spice under the visible-name design. |
| `dud` | Blank or intentionally inert scrolls. | Very rare until a crafting/writing system exists. |

The tests enforce that implemented scrolls have tuning and tuned scrolls are
implemented.

## Effect Execution

Implement behavior in `GameEngine.applyScrollEffect()`. Return `true` when the
scroll should be consumed and a turn should pass. Return `false` only for a
foreseeable no-op that should keep the scroll.

```ts
case 'my_new_scroll': {
  const changed = this.doMyEffect();
  this.addLog(changed
    ? 'You read the Scroll of My New Scroll. Something changes.'
    : 'You read the Scroll of My New Scroll, but nothing answers.');
  return true;
}
```

Keep visual/log feedback even when sound exists. Sound is additive.

Do not call audio APIs or name audio files in the engine. The engine emits typed
domain events; the manifest resolves them.

## State and Save Migration

If a scroll only changes current map/player/monster state that is already saved,
it may not need a save version bump.

If it adds a persisted field, such as a new `StatusEffects` counter:

1. Add the field to `src/types.ts`.
2. Initialize it in `GameEngine.statusEffects` and `initGame()`.
3. Tick or clear it in `processTurn()` / floor travel as needed.
4. Bump `VERSION` in `src/persistence/savegame.ts`.
5. Accept the previous version in `migrate`.
6. Backfill the missing field in `validateSaveGame()`.
7. Add savegame tests for old-version migration and active-state restore.

Example:

```ts
const statusEffects: StatusEffects = {
  vigorTurns: Number(se.vigorTurns),
  midasTurns: Number(se.midasTurns),
  strengthTurns: Number(se.strengthTurns),
  invisTurns: Number(se.invisTurns),
  armorTurns: Number(se.armorTurns),
  myNewTurns: Number(se.myNewTurns ?? 0),
};
```

## Rendering Rules

Most scrolls should not touch rendering. If the effect needs map presentation,
keep the render signal separate from gameplay signals.

Avoid these shortcuts:

- Do not set `visible[y][x] = true` unless the scroll really grants sight.
- Do not set `explored[y][x] = true` unless the scroll really reveals terrain or
  remembered item locations.
- Do not reuse visible-monster tooltips, targeting, or portraits for sensed-only
  information without checking the gameplay implications.

Pattern from Monster Detection:

- Engine owns the status counter.
- `draw()` passes a boolean to `GameUI.render()`.
- `GameUI` draws a separate sensed layer for non-visible monsters.
- Existing FOV, combat, portraits, and targeting keep using `visible`.

## Art and Icons

Compact icon:

1. Add `scroll-<type>` to `SCROLL_ICONS` in `src/ui/icons.ts`.
2. Keep it simple and legible at button size.
3. Match `SCROLL_VISUALS[type].icon`.

Full inventory PNG:

1. Add a prompt row to `design/implemented/inventory_image_generation.md`.
2. Add a matching `gen` line to `scripts/gen-scroll-art.sh`.
3. Generate only the new asset when possible:

```bash
mflux-generate-flux2 \
  --model Runpod/FLUX.2-klein-4B-mflux-4bit \
  --base-model flux2-klein-4b \
  --steps 8 \
  --width 512 \
  --height 512 \
  --seed 8537 \
  --prompt "single centered dark fantasy roguelike inventory item illustration, SUBJECT, readable silhouette at small UI size, smoky charcoal dungeon background, subtle vignette, dramatic rim lighting, painterly concept art, high contrast, crisp edges, atmospheric but not blurry, no text, no letters, no logo, no border, no UI, no frame" \
  --output public/inventory/scroll-of-my-new-scroll.png
```

`src/ui/inventoryArt.test.ts` fails until the PNG exists.

## Keyboard and UI

No new global shortcut is needed for ordinary scrolls. Use the existing flow:

- `r` opens the scroll-focused inventory modal.
- Arrow keys move between choices.
- Return reads the selected scroll.
- `r` inside the modal reads a selected scroll.
- Escape closes without consuming.

If a scroll needs target selection, reuse the shared inventory modal or the
existing targeting/aiming patterns. Do not add a pointer-only control path.

## Tests

Add tests at the layer your scroll touches:

- `src/scrolls.test.ts`: registry entry, display name, spawn tuning, floor gate.
- `src/map.test.ts`: only if spawn rules or floor item shape changes.
- `src/engine.scrolls.test.ts`: consumption, turn cost, no-op behavior, logs,
  status counters, map/player/monster mutations.
- `src/persistence/savegame.test.ts`: required when adding persisted state.
- `src/ui/inventoryArt.test.ts`: usually covered automatically by adding the PNG.
- UI/render helper tests: required when adding a new render state or canvas layer.

Run:

```bash
npm test -- --run src/scrolls.test.ts src/engine.scrolls.test.ts src/persistence/savegame.test.ts src/ui/inventoryArt.test.ts
npm run check
```

## Common Mistakes

- Adding a `ScrollType` but forgetting `SCROLL_TYPES`.
- Adding `SCROLL_TUNING` before the effect is in `IMPLEMENTED_SCROLLS`, or vice
  versa.
- Burning a player turn for a no-op that should keep the scroll.
- Mutating `visible` for an information-only effect.
- Adding persisted state without bumping and migrating the save version.
- Forgetting the full PNG, which breaks the inventory art test.
- Adding an audio clip without updating both the sound prompt guide and manifest.
