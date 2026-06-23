# Survival Warning UI Plan

## Current Situation

Rogue already warns about dangerous survival states, but the warnings are easy to
miss during fast keyboard play.

- Health is visible in `Vitals.svelte` as a segmented bar and numeric `hp/maxHp`
  readout.
- Hunger is visible as a progress ring, with labels and tones derived by
  `hungerView()` in `src/ui/format.ts`.
- Sound cues already exist for `player.lowHealth`, `player.criticalHealth`,
  `hunger.hungry`, `hunger.fatigued`, `hunger.starving`, and
  `hunger.starveTick`.
- Hunger thresholds are centralized in `BALANCE.player`: `hungerHungry = 425`
  and `hungerFatigued = 190`, with `hungerMax = 800`.
- The Svelte shell is driven by the `ui` state bridge in `src/ui/store.svelte.ts`,
  updated from `GameUI.updateStats()` in `src/ui.ts`.

The missing piece is an ambient, hard-to-miss visual state that communicates "you
are in real danger" without adding another modal, banner, or intrusive control.

## Goals

- Add an at-a-glance survival warning when the player is near starvation, near
  death, or both.
- Keep the effect subtle enough that it feels like dungeon atmosphere, not an
  arcade alarm.
- Make the combined state distinct from either individual warning.
- Preserve text and canvas legibility on desktop and mobile.
- Keep sound additive: existing gauges, log feedback, and audio remain the source
  of precise information.
- Respect keyboard-first gameplay. This feature must not add focusable elements,
  trap focus, or interfere with shortcuts.
- Respect motion sensitivity with a reduced-motion fallback.

## Proposed Model

Add a pure display helper beside `hungerView()`:

```ts
export type SurvivalWarningTone = 'none' | 'hunger' | 'health' | 'both';

export function survivalWarningView(input: {
  hp: number;
  maxHp: number;
  hunger: number;
  hungerFatigued: number;
}): { tone: SurvivalWarningTone; intensity: number };
```

Suggested v1 thresholds:

- `nearStarved`: `hunger > 0 && hunger < hungerFatigued`
- `starving`: `hunger <= 0`
- `nearDead`: `maxHp > 0 && hp / maxHp <= 0.25`
- `criticalHp`: `maxHp > 0 && hp / maxHp <= 0.15`

Tone selection:

- `both` when a hunger warning and HP warning are active.
- `hunger` when only hunger is active.
- `health` when only HP is active.
- `none` otherwise.

Intensity:

- Start at `0.45` for `nearStarved` or `nearDead`.
- Raise toward `1` as hunger approaches zero or HP approaches `15%`.
- Use the max of the two intensities for `both`, with a small cap bump so the
  combined state is readable without becoming garish.

This keeps the UI rule deterministic and testable, and it avoids making Svelte
components infer gameplay thresholds ad hoc.

## UI State Bridge

Extend `UIState` in `src/ui/store.svelte.ts`:

```ts
survivalWarningTone: SurvivalWarningTone;
survivalWarningIntensity: number;
```

In `GameUI.updateStats()`:

- Continue deriving `hungerStatus`, `hungerPct`, and `hungerTone` as today.
- Call `survivalWarningView()` with the current HP, effective max HP, raw hunger,
  and `BALANCE.player.hungerFatigued`.
- Write the result to `ui.survivalWarningTone` and
  `ui.survivalWarningIntensity`.

This keeps the visual shell reactive without touching engine state or audio
state.

## Visual Direction

Render the warning at the app frame level in `src/ui/App.svelte`, not inside the
vitals widget. The player should feel the whole dungeon UI breathing a little
when survival is precarious.

Add classes/data attributes to the root frame:

```svelte
<div
  class="frame"
  data-survival-warning={ui.survivalWarningTone}
  style:--survival-intensity={ui.survivalWarningIntensity}
>
```

Suggested tones:

- `hunger`: a dry amber/ochre pulse, like torchlight thinning out.
- `health`: a low red pulse, like a heartbeat under the stone.
- `both`: a sickly bruised crimson-violet with a faint amber edge. It should be
  recognizably different from "just low HP."

Suggested implementation:

- Use `::before` on `.frame` as a non-interactive overlay:
  `pointer-events: none; z-index: 0;`.
- Put actual app content in stacking context above it.
- Combine:
  - a radial edge vignette,
  - a very low-opacity repeating-linear-gradient texture,
  - a slow opacity pulse.
- Keep center-stage and rail content readable by limiting the overlay's maximum
  alpha and favoring edges/corners over the center.
- Avoid changing text colors globally. If vitals need emphasis, add a local
  glow/border to existing HP and hunger components rather than recoloring all
  chrome.

Example CSS shape:

```css
.frame::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background:
    radial-gradient(circle at 50% 45%, transparent 36%, var(--survival-wash) 100%),
    repeating-linear-gradient(135deg, transparent 0 8px, var(--survival-grain) 8px 9px);
  animation: survival-pulse 2.8s var(--ease) infinite;
}
```

The precise alpha values should be tuned in-browser with a live low-HP/low-food
save state. Start lower than feels necessary; the effect can be fun without
shouting.

## Texture

Use CSS texture first. It is cheap, themeable, and cannot fail to load.

If this feels too flat after browser proof, add a tiny local PNG under
`public/ui/` as an optional alpha mask, but keep the CSS-only version as the
baseline. Do not use generated large background images for v1; this warning must
be lightweight and deterministic.

Texture ideas:

- `hunger`: faint desiccated crosshatch / parchment fiber.
- `health`: soft arterial ripple / heartbeat edge bloom.
- `both`: fractured crosshatch plus heartbeat, using lower opacity so it stays
  legible.

## Reduced Motion and Accessibility

- Under `@media (prefers-reduced-motion: reduce)`, remove the pulse animation and
  show a static low-alpha warning wash.
- Do not rely on color alone for exact state. The existing HP number, HP bar,
  hunger ring, and hunger label remain visible.
- The overlay should not be announced by screen readers. It is decorative;
  existing progress bars and labels carry semantic status.
- Maintain contrast for top bar, footer, rails, inventory text, and map glyphs.

## Keyboard-First Impact

This feature adds no controls. Verification still needs keyboard coverage:

- Drive the player into `hunger` warning state using keyboard turns.
- Confirm movement, eating (`e`/existing eat shortcut), inventory opening, and
  modal shortcuts still work while the ambient warning is active.
- Confirm Return/arrow behavior in open modals remains unchanged.
- Confirm focus rings remain visible against each warning tone.

## Implementation Steps

1. Add `SurvivalWarningTone` and `survivalWarningView()` to `src/ui/format.ts`.
2. Add focused unit tests for threshold and combined-state behavior.
3. Extend `UIState` defaults in `src/ui/store.svelte.ts`.
4. Update `GameUI.updateStats()` to derive and write the warning state.
5. Update `App.svelte` root markup and CSS for the ambient overlay.
6. Tune desktop and mobile CSS so content stays readable.
7. Add reduced-motion CSS.

## Verification

Automated:

- `npm run check`
- Add or extend `src/ui/format.test.ts` for `survivalWarningView()`.

Manual/browser:

- Desktop viewport: normal, `hunger`, `health`, and `both` states.
- Mobile viewport: same four states, with rails stacked.
- Keyboard smoke:
  - Move with arrow keys.
  - Eat food from the warning state.
  - Open and close inventory/settings/compendium.
  - Confirm focus remains visible.
- Reduced motion:
  - Emulate `prefers-reduced-motion: reduce` and confirm the warning is static.

Visual proof should include screenshots for the three active tones plus one
normal state. The proof should specifically check that message log text,
inventory labels, HP/hunger readouts, and map glyphs remain legible.

## Non-Goals

- No new sound events in v1. Existing health and hunger cues already cover this
  gameplay need.
- No engine behavior changes.
- No death-prevention mechanic, auto-eat, or forced pause.
- No modal, toast, or banner warning.
- No large generated background asset unless browser proof shows CSS texture is
  insufficient.

## Open Tuning Questions

- Should low HP warning start at `25%`, or should it match the existing audio
  tracker's low-health threshold exactly?
- Should hunger warning begin at `Fatigued`, or should it start slightly before
  Fatigued so the player gets a pre-warning?
- Should the `both` tone pulse faster than individual warnings, or only change
  color/texture?
- Should the HP segmented bar get a subtle synchronized pulse in `health` and
  `both`, or should the app-frame atmosphere be the only new effect?
