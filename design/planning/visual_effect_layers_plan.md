# Visual Effect Layers Plan

## Current Situation

Rogue already has the first version of a HUD warning effect, but it is a
single-purpose path:

- `survivalWarningView()` in `src/ui/format.ts` derives one
  `{ tone, intensity }` pair from HP and hunger.
- `GameUI.updateStats()` in `src/ui.ts` writes that pair into
  `ui.survivalWarningTone` and `ui.survivalWarningIntensity`.
- `src/ui/components/CenterStage.svelte` renders one `.survival-wash` layer
  above the canvas, with variants for `hunger`, `health`, and `both`.
- `src/ui/components/Vitals.svelte` separately pulses the hunger ring and HP bar
  from the same survival warning state, reading `ui.survivalWarningTone`.

That works for the current hunger/damaged warning, but it does not scale to
layered atmosphere like floor fog, poison haze, magic shimmer, boss pressure, or
separate effects on the chrome and the game stage.

## Goals

- Generalize the hunger and low-HP wash into a reusable visual effect system.
- Support multiple simultaneous layers with deterministic ordering.
- Render effects on the game stage and the UI chrome independently.
- Let chrome effects appear behind top-bar, left-rail, and right-rail content
  without interfering with controls, focus rings, or keyboard play.
- Let stage effects target either the dungeon background, the game canvas, or an
  above-canvas atmospheric layer.
- Keep background images visible through translucent effects such as green fog.
- Keep visual effects declarative and testable rather than scattering CSS
  conditionals through components.
- Respect `prefers-reduced-motion`.
- Preserve existing visual/log/audio feedback. Effects are additive flavor and
  danger signaling, not the only source of information.

## Non-Goals

- Do not move engine gameplay rules into Svelte components.
- Do not add interactive controls in this pass.
- Do not replace canvas combat animations in `src/ui.ts`; those remain
  board-anchored effects.
- Do not introduce runtime calls to image, video, or audio generation APIs.
- Do not make opaque full-screen overlays that hide the dungeon art or HUD.

## Proposed Model

Create a declarative visual-effects layer beside the existing display helpers:

```ts
// src/ui/visualEffects.ts
export type VisualEffectTarget =
  | 'chrome'
  | 'stage-backdrop'
  | 'stage-overlay';

export type VisualEffectKind =
  | 'survival-hunger'
  | 'survival-health'
  | 'survival-both'
  | 'floor-green-fog';

export interface VisualEffectInstance {
  id: string;
  kind: VisualEffectKind;
  target: VisualEffectTarget;
  layer: number;
  intensity: number;
  className: string;
  vars?: Record<string, string | number>;
}

export interface VisualEffectInput {
  floor: number;
  hp: number;
  maxHp: number;
  hunger: number;
  hungerFatigued: number;
}

export function visualEffectLayers(input: VisualEffectInput): VisualEffectInstance[];
export function visualEffectStyle(effect: VisualEffectInstance): string;
```

The output is an ordered list of currently active effects. Components render the
list; they do not decide whether the player is hungry, dying, or standing on a
foggy floor.

**Single source of truth for survival.** `visualEffectLayers()` must derive the
survival layer by calling the existing `survivalWarningView()` from `format.ts`,
not by re-implementing the HP/hunger thresholds. The mapping is:
`survivalWarningView` → `{ tone, intensity }`, then `tone` (`'hunger' | 'health'
| 'both'`) selects the `survival-*` effect kind and `intensity` becomes the
instance `intensity`. This keeps `format.test.ts` the authority on thresholds
and guarantees the migrated wash matches the current trigger behavior exactly.
For the migration, `Vitals.svelte` keeps reading `ui.survivalWarningTone` (we
keep populating it), so its pulse logic is untouched in V1.

V1 should migrate the existing survival warning into this model:

- Hunger warning becomes `survival-hunger`.
- Low HP becomes `survival-health`.
- Overlap becomes either `survival-both` or two layered instances, depending on
  final tuning. Prefer the explicit `survival-both` effect for V1 so the
  existing distinct combined state remains intact.
- Green fog is added as the first floor/biome-style atmospheric effect.

## Targets

### `chrome`

Chrome means the top bar plus both side rails. The effect should sit behind the
content inside each chrome region, not above buttons or text.

Recommended component shape:

```svelte
<ChromeRegion class="rail rail-left">
  <CharacterCard />
  <Vitals />
  <Equipment />
  <Consumables />
</ChromeRegion>
```

Each region uses:

- `position: relative`
- `overflow: hidden`
- an effect host with `position: absolute; inset: 0; z-index: 0`
- content wrappers with `position: relative; z-index: 1`
- `pointer-events: none` on every effect layer

If introducing `ChromeRegion.svelte` is too much for the first slice, add the
effect host directly to `TopBar.svelte` and the two rail wrappers in
`App.svelte`. The important part is that the region backgrounds become a little
transparent or move to a `::before` layer so fog can actually show through.

### `stage-backdrop`

Stage backdrop effects render in `CenterStage.svelte` between the rotating
background image and the canvas. Use this for environmental fog that should tint
or move over the art while keeping the dungeon glyphs crisp.

Stacking order:

1. floor background color
2. rotating background image
3. `stage-backdrop` effect layers
4. canvas
5. vignette
6. `stage-overlay` effect layers
7. prompts, tooltips, end-run screen

### `stage-overlay`

Stage overlay effects render above the canvas, where the current
`.survival-wash` lives. Use this for danger warnings, magical flashes, poisoning,
or boss pressure that should wash over the playable board.

## Rendering Components

Add a small reusable renderer:

```svelte
<!-- src/ui/components/EffectLayerHost.svelte -->
<script lang="ts">
  import {
    visualEffectStyle,
    type VisualEffectInstance,
    type VisualEffectTarget,
  } from '../visualEffects';

  export let effects: VisualEffectInstance[] = [];
  export let target: VisualEffectTarget;
</script>

<div class="effect-host" data-target={target} aria-hidden="true">
  {#each effects.filter(e => e.target === target).sort((a, b) => a.layer - b.layer) as effect (effect.id)}
    <div
      class={`effect-layer ${effect.className}`}
      style={visualEffectStyle(effect)}
    ></div>
  {/each}
</div>
```

Implementation detail: build `varsCss` in TypeScript rather than trying to bind
an object directly into Svelte style text. Keep values sanitized to CSS custom
properties generated by our own effect registry.

## State Bridge

Extend `UIState`:

```ts
visualEffects: VisualEffectInstance[];
```

In `GameUI.updateStats()`:

1. Keep writing `survivalWarningTone` and `survivalWarningIntensity` for the
   vitals pulse during the migration.
2. Add `ui.visualEffects = visualEffectLayers({...})`.
3. Once `CenterStage.svelte` no longer reads `survivalWarningTone` directly for
   the wash, consider keeping the survival fields only for localized vitals
   emphasis or replacing them with selectors over `ui.visualEffects`.

This keeps the engine unaware of CSS and filenames, matching the existing
engine-to-UI boundary.

## Effect Definitions

Keep effect recipes in one CSS file imported by `src/styles.css`, for example:

```css
/* src/ui/styles/effects.css */
.effect-host {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.effect-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: var(--fx-opacity, 1);
  mix-blend-mode: var(--fx-blend, normal);
}

.fx-survival-hunger { ... }
.fx-survival-health { ... }
.fx-survival-both { ... }
.fx-green-fog { ... }
```

Use CSS variables for intensity, color, speed, and scale:

- `--fx-intensity`
- `--fx-opacity`
- `--fx-color-a`
- `--fx-color-b`
- `--fx-speed`
- `--fx-drift`

This allows one class like `.fx-green-fog` to be reused on chrome and stage with
different intensity or speed.

## Green Fog Direction

Start with CSS-only fog so it is cheap, deterministic, and easy to tune:

- layered radial gradients for cloudy pockets,
- a soft linear gradient for directional drift,
- slow background-position animation,
- low alpha,
- `mix-blend-mode: screen` or `soft-light`, chosen per target after browser
  proof.

For the chrome target, keep fog behind the text and controls:

- lower opacity than stage fog,
- avoid high-frequency grain near labels,
- no blur filter over content,
- keep focus rings above the effect.

For stage backdrop, fog can be more visible because it sits behind the canvas.
For stage overlay, use sparingly because it can reduce glyph contrast.

## Floor Rules

Do not hardcode floor checks inside components. Add a small rule table near
`visualEffectLayers()`:

```ts
const FLOOR_EFFECTS = [
  {
    id: 'mire-green-fog',
    floors: [11, 12, 13],
    effect: 'floor-green-fog',
    targets: ['chrome', 'stage-backdrop'],
  },
];
```

Later, this can move closer to `theme.ts` if floor visuals and palette metadata
should share a registry. For V1, keeping it in `visualEffects.ts` makes the
system easy to test without changing dungeon theming.

## Migration Plan

1. Add `src/ui/visualEffects.ts` with the effect types, floor rules, and
   `visualEffectLayers()` helper.
2. Add unit tests for survival migration, combined warning behavior, no-effect
   safe state, and floor fog activation.
3. Extend `UIState` with `visualEffects: VisualEffectInstance[]`.
4. Update `GameUI.updateStats()` to populate `ui.visualEffects` while preserving
   existing survival warning fields.
5. Add `EffectLayerHost.svelte`.
6. Add `src/ui/styles/effects.css` and import it from `src/styles.css` or
   `src/ui/styles/global.css`.
7. Replace `CenterStage.svelte`'s hardcoded `.survival-wash` with:
   - `EffectLayerHost target="stage-backdrop"` between background image and
     canvas,
   - `EffectLayerHost target="stage-overlay"` where `.survival-wash` is today.
8. Add chrome hosts for `TopBar`, left rail, and right rail. Prefer a
   `ChromeRegion.svelte` wrapper if it keeps `App.svelte` simple.
9. Port the old hunger/health/both CSS into `.fx-survival-*` classes and compare
   against the current look.
10. Add the first `.fx-green-fog` class and floor rule.
11. Tune opacity, blend modes, reduced-motion fallbacks, and mobile rail stacking
    in browser.
12. Remove the obsolete hardcoded `.survival-wash` CSS after visual parity is
    proven.

## Testing

Automated:

- `npm run check`
- Unit tests for `visualEffectLayers()`.
- Existing `src/ui/format.test.ts` should continue to cover hunger labels and
  survival warning intensity while those fields remain.

Manual/browser proof:

- Normal safe state has no active effect layers.
- Hunger-only state still has the amber survival wash.
- Low-HP-only state still has the red survival wash.
- Combined hunger plus low HP remains visually distinct.
- A green-fog floor shows fog behind the top bar, left rail, right rail, and
  stage background.
- Background art remains visible through fog.
- Canvas glyphs and text remain readable on desktop and mobile.
- Keyboard movement, eating, inventory, settings, compendium, Return activation,
  and arrow-key modal navigation still work while effects are active.
- Focus rings remain visible over chrome fog.
- `prefers-reduced-motion: reduce` removes drift/pulse animation while retaining
  a static low-alpha effect.

## Decisions Resolved (V1)

These were open; locked in for this pass so implementation is unambiguous.

- **Floor keying:** key floor effects by **floor number** via the `FLOOR_EFFECTS`
  table in `visualEffects.ts`. Theme/level-metadata keying is deferred; a comment
  notes the future move toward `theme.ts`. Keep it pure so it stays unit-testable.
- **`survival-both`:** **stays a unique effect** in V1 (single instance with
  `kind: 'survival-both'`), preserving the current distinct combined look.
  Independent stacking is a later experiment, not this pass.
- **Stage fog target:** green fog defaults to **`stage-backdrop`** (behind the
  canvas) to protect glyph readability. `stage-overlay` fog is opt-in per effect
  and used sparingly.
- **Chrome transparency:** do **not** lower the solid `--surface-rail` /
  top-bar background opacity directly (that risks the UI feeling flimsy and can
  hurt text contrast). Instead the chrome effect host sits on a `::before`-style
  absolute layer *inside* the region, above the solid background but below
  content, at low opacity. Chrome fog reads as a faint tint over the existing
  solid panel rather than making the panel see-through. Tune exact alpha in
  browser proof (start ≤ 0.12 intensity-scaled).

## Deferred / Still Open (post-V1)

- Independent hunger+health stacking vs. the unique `survival-both` effect.
- Moving floor rules into `theme.ts` as a shared visual registry.
- Additional biome atmospheres (poison haze, magic shimmer, boss pressure).

## Suggested First Implementation Slice

Build the infrastructure without changing the player's experience:

1. Add the registry, UI state field, and tests.
2. Render the current survival wash through `EffectLayerHost` on
   `stage-overlay`.
3. Verify visual parity and keyboard behavior.

Then add chrome hosts and green fog as the second slice. That keeps the risky
part small: first prove the layer system can replace the current warning, then
let it do new atmospheric work.
