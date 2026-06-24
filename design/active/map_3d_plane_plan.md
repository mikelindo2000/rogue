# Map on a 3D Plane Plan

> **Status (active).** Phase 1 shipped on branch `map-3d-plane`: the canvas is
> wrapped in `.map-viewport > .map-plane`, `MapStageController`
> (`src/ui/mapStage.ts`) drives the plane off GameUI's rAF loop, and a heavy-hit
> **rumble** fires from `executeStrike` (gated by `isHeavyHit` in
> `src/combat.ts`) alongside a new `combat.heavyHit` SFX (4 `combat-rumble-0N`
> variants). Phases 2–4 (floor transitions, depth effects, settings) are the
> prototype menu still to evaluate. The pointer→tile caveat below governs how far
> the persistent effects can go.

## Current Situation

The dungeon is drawn to a single Canvas 2D element, `#gameCanvas`, that lives
inside `src/ui/components/CenterStage.svelte`. Critically, the map is already
*physically separate* from everything around it:

- **Behind it** — rotating background art (`.bg-image-container`) and the
  `stage-backdrop` effect layer (floor fog, atmosphere).
- **The map itself** — `<canvas id="gameCanvas">`, the only thing that draws the
  dungeon. `GameUI` in `src/ui.ts` owns it: it sizes the backing store to the
  board at `devicePixelRatio`, draws every tile/monster/item/effect imperatively,
  and runs an on-demand `requestAnimationFrame` loop (`ensureLoop`) that only
  spins while combat effects or glides are alive.
- **In front of it** — the `.vignette` framing, the `stage-overlay` effect layer
  (danger washes, survival warnings), and floating UI (stairs pill, monster
  tooltip, aim prompt, end screen).

The canvas already carries a `transform` of its own: `applyViewTransform()`
(`src/ui.ts:251`) sets `canvas.style.transform = translate(...)` to pan the board
so the player stays centered on small screens. `transform-origin: center center`
is already declared in the component CSS.

The engine drives all presentation through a narrow, well-established seam — a set
of `ui.fx*()` methods (`fxStrike`, `fxHit`, `fxDeath`, `fxDive`, `fxPlayerHit`,
…) called from `src/engine.ts` at the moment each gameplay event happens. Floor
changes run through `Engine.travelStairs()` (`src/engine.ts:834`), which already
restores/regenerates the floor and calls `draw()`.

So the substrate for "put the map on a 3D plane" is unusually favorable: one
self-contained element, a clean event seam, an existing rAF discipline, and a
clean front/back layering that means we can move *only the map* in 3D while the
art and HUD stay flat.

## Goals

- Mount the dungeon map on its own 3D plane so it can be moved/rotated/tilted in
  perspective space, **independent of its background art and the HUD**, which
  stay flat.
- Provide a small, imperative, engine-triggerable effects API that mirrors the
  existing `ui.fx*()` seam — e.g. a screen-shake-style **rumble** on heavy
  attacks, and a **floor-transition** when descending/ascending stairs.
- Make the system a prototyping harness: cheap to add/remove candidate effects
  (rumble, tilt/parallax, floor transitions, full rotation) and toggle them, so
  we can try them live and keep the ones that feel good.
- Reuse the existing on-demand rAF loop rather than introducing a second
  always-on animation loop.
- Respect `prefers-reduced-motion` (established project convention) and keep every
  effect purely cosmetic — no gameplay state, timing, or information lives in the
  3D layer.
- Keep the map crisp. The canvas backing store is rendered at dpr; tilt/translate
  in CSS 3D preserve that, unlike scaling a pre-rasterized bitmap.

## Non-Goals

- **Not** rewriting the Canvas 2D renderer into WebGL/Three.js in this pass. The
  whole tile/glyph/effect pipeline in `src/ui.ts` stays exactly as is; we only
  transform the element it draws into. (A WebGL future is sketched in "Later" —
  it's the upgrade path, not this plan.)
- **Not** moving the background art or HUD onto the 3D plane. The point of the
  feature is that the map moves against a stable frame.
- **Not** putting any gameplay logic, RNG that affects play, or
  source-of-truth state into the presentation layer.
- **Not** committing to a final effect set now. This plan ships the harness plus
  two reference effects (rumble, floor transition); the rest is a prioritized
  menu we prototype and choose from.

## Proposed Architecture

### The plane wrapper

Today the canvas is a direct flex child of `.stage`. We introduce two wrapper
elements around it so 3D transforms have a clean home that does not fight the
existing pan transform:

```
.stage                      (existing; flat, holds bg art + overlays)
  └── .map-viewport         (NEW) perspective: <P>px; perspective-origin: center
        └── .map-plane      (NEW) transform-style: preserve-3d;
                                  ← 3D effect transform applied HERE
              └── canvas#gameCanvas   ← keeps its own translate() pan, unchanged
```

- `.map-viewport` establishes the perspective. It sits exactly where the canvas
  sits in the flex layout (so centering is unchanged), behind the vignette/overlay
  and in front of the background art.
- `.map-plane` is the element the effects controller drives. Its transform
  (rumble jitter, tilt, floor-transition slide/rotate) **composes** with the
  canvas's own pan `translate()` because they're separate elements — we never
  have to merge two transforms onto one `style.transform` string.
- The canvas keeps everything it does now (backing-store sizing, pan transform).
  `GameUI` learns about `.map-plane` only to hand it to the controller.

### The effects controller

A new `MapStageController` (e.g. `src/ui/mapStage.ts`) owns `.map-plane`'s
transform. It exposes a tiny imperative API and is driven by the **existing**
rAF loop (we extend `GameUI.ensureLoop()` so the loop also stays alive while a
map effect is animating, and `paint()` — or a sibling tick — writes the plane
transform each frame).

```ts
// shape only — final names TBD during prototyping
class MapStageController {
  rumble(opts?: { intensity?: number; durationMs?: number }): void;
  floorTransition(dir: 1 | -1, opts?): Promise<void> | void; // descend / ascend
  tilt(state): void;        // ambient/persistent lean (Phase 3 candidate)
  settle(): void;           // return to identity
  isAnimating(): boolean;   // so ensureLoop keeps spinning
  applyFrame(tNow: number): void; // called by the rAF tick; writes transform
  setReducedMotion(reduced: boolean): void;
}
```

Effect math lives here as transient, time-based curves (same pattern as
`hitAt()`'s `Math.sin` shake in `src/ui.ts:695`): each active effect has a
`start`, a `life`, and a function of elapsed time that contributes to a composed
`transform` string (`translate3d(...) rotateX(...) rotateZ(...) scale(...)`),
damped to identity as it expires. Multiple effects sum.

### Engine trigger seam

Triggers mirror the existing fx seam exactly — the engine calls a `ui` method at
the gameplay moment:

- **Rumble** — alongside existing `ui.fxHit` / `ui.fxPlayerHit` call sites in
  `src/engine.ts` (e.g. crits, player taking a big hit, large-monster death).
  Add e.g. `this.ui.mapRumble(strength)` next to the relevant `fx*` call.
- **Floor transition** — in `Engine.travelStairs()` (`src/engine.ts:834`), around
  the existing save/load/`draw()` sequence. The controller runs the out/in
  animation while the board snapshot swaps underneath (or between two stacked
  planes for a crossfade — see Phase 2).

`GameUI` gets thin pass-through methods (`mapRumble`, `mapFloorTransition`, …) so
the engine never reaches into the controller directly, keeping the same
`ui.*` facade it already uses.

### Why CSS 3D transforms, not WebGL (for now)

The map is already a finished, crisp raster every frame. Wrapping it in
`perspective` + `transform: rotateX()/translate3d()` gives us rumble, tilt,
parallax, and floor transitions *for free*, with zero changes to the rendering
pipeline and no new dependency. It is the fastest path to a live prototype we can
judge by feel — which is exactly what this effort is for. WebGL unlocks
*shader-grade* effects (per-tile displacement ripples, real lighting, heat-haze)
but is a large rewrite; we defer it until a chosen effect actually needs it.

## The effect menu (prototype + choose)

Shipped as reference effects:

1. **Rumble / screen-shake** — short, damped `translate3d` (+ a touch of
   `rotateZ`) jitter on heavy combat events. The "hello world" of the plane and
   the cheapest win. *Reference effect, Phase 1.*
2. **Floor transitions** — on stairs, the current floor slides/rotates away in Z
   and the new floor flies in (candidates: push-through-the-floor `translateZ` +
   fade, hinge `rotateX`, lateral slide). *Reference effect, Phase 2.*

Candidate effects to prototype and keep-or-cut:

3. **Tilt / parallax** — a subtle persistent `rotateX` lean (isometric-ish), or a
   tilt that responds to player position near edges, giving the map physical
   depth against the flat background.
4. **Rotation** — `rotateZ`/`rotateY` of the whole board (e.g. a dramatic spin on
   a teleport scroll, level-up, or boss entrance). High wow-factor, highest input
   cost (see Risks).
5. **Impact/landing** — a quick `scale` punch or Z-dip on stomps, big spells, or
   trap triggers.
6. **Ambient sway** — near-imperceptible idle drift so the board feels alive
   rather than static.

## Key Risk: pointer → tile mapping

This is the one real gotcha and it shapes the phasing. The canvas handles
pointer input (monster hover/tooltip, click, wand aiming), and the screen
position of a tile is computed from the canvas rect (`getBoundingClientRect` at
`src/ui.ts:221`). Any 3D transform on the plane moves tiles on screen, so a naive
implementation breaks hit-testing while an effect is active.

Mitigations, in order of how much they cost:

- **Transient effects are fine as-is.** Rumble and floor transitions are short
  (a few hundred ms) and either fire when input isn't happening or are small
  enough that a few px of slop for ~250ms is unnoticeable. Phase 1–2 simply
  accept this.
- **Suppress geometry-perturbing effects during precise input.** While aiming a
  wand (`ui.aiming` is set), hold the plane at identity (or only allow
  non-translating effects). Cheap and robust.
- **Invert the transform for hit-testing.** For *persistent* tilt/rotation
  (Phase 3+), the pointer→tile math must un-project through the plane's current
  matrix. This is the price of making rotation a default rather than a one-shot,
  and is the main reason rotation starts as an opt-in flourish, not always-on.

## Phasing

**Phase 1 — Harness + rumble (the prototype spine).**
- Add `.map-viewport` / `.map-plane` wrappers in `CenterStage.svelte`; verify the
  board still sizes, centers, pans, and paints identically at rest (transform =
  identity ⇒ pixel-for-pixel unchanged).
- Add `MapStageController`; wire it to the existing `ensureLoop`/`paint` rAF so
  the loop stays alive while a map effect animates and writes the plane transform
  each frame.
- Implement `rumble`; trigger it from a couple of combat sites in `engine.ts`.
- Honor `prefers-reduced-motion` (reduce to identity or a tiny opacity/feedback).
- This is the prototype we evaluate before going further.

**Phase 2 — Floor transitions.**
- Implement `floorTransition(dir)`; hook into `travelStairs()`. Prototype 2–3
  transition styles (push-through, hinge, slide) behind a quick switch and pick
  one. Decide single-plane (animate, swap snapshot, animate in) vs. two stacked
  planes for a true crossfade.

**Phase 3 — Depth effects (tilt / parallax / rotation), choose-and-keep.**
- Prototype the candidate menu (tilt, rotation, impact punch, ambient sway).
- For any persistent geometry change, implement transform-inverted hit-testing or
  gate it as a one-shot. Promote the ones that feel good; delete the rest.

**Phase 4 — Polish & settings.**
- A settings toggle (the project already has a SettingsModal) to scale or disable
  map motion independently of `prefers-reduced-motion`.
- Tune intensities/durations to match the established `FX_LIFE` feel.

## Testing

- **Rest-state equivalence:** with all effects at identity, the board renders and
  positions exactly as before (guards the wrapper refactor). Existing `ui`/render
  tests should be unaffected.
- **Controller unit tests (no DOM):** `MapStageController` transform math is pure
  time→transform — assert that effects start at ~identity, peak, and damp back to
  identity by `life`, that summed effects compose, and that `isAnimating()`
  flips correctly. (Matches how combat fx timing is already structured.)
- **Reduced-motion:** asserts effects collapse to identity / no transform.
- **Input gating:** while `ui.aiming` is set (or during a transition), the plane
  holds a hit-testable state. Manual/preview verification for feel, since the
  payoff is subjective.

## Later (the WebGL upgrade path)

If a chosen effect needs more than CSS 3D can give — per-tile ripple
displacement, real lighting, shader haze — the migration is contained: render the
existing Canvas 2D output as a texture onto a WebGL/Three.js quad and move the
`.map-plane` transforms into the 3D scene. Everything in `src/ui.ts` keeps
producing the same per-frame raster; only the *mounting surface* changes. Keeping
the controller API stable now means that swap doesn't ripple into the engine.

## Open Questions (to resolve while prototyping)

- Perspective strength `P` and whether perspective is fixed or scales with board
  size.
- Floor-transition: single animated plane vs. two stacked planes (crossfade).
- Does the `.vignette` frame stay flat (frames the moving map — likely yes) or
  move slightly with big rotations for cohesion?
- Which exact combat events earn a rumble, and the intensity curve per event.
