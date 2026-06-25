# Death Transition Adapter

Rogue now inserts a brief map-plane transition between player death and the
end-run image/stat screen. The integration point is intentionally outcome-aware:
the host passes a compact `DeathTransitionRequest` containing `outcome`,
`deathCause`, `floorReached`, `killedByMonsterId`, and `runId`. Today only death
requests resolve to an effect; future victory, floor-20, starvation, or
monster-specific transitions can be selected from the same request without
rewiring the end screen.

## Runtime Flow

1. `GameEngine.finalizeRun()` still builds and publishes the normal
   `RunSummaryV1`.
2. `main.ts` stores the summary immediately, sets
   `ui.endRunPresentationReady = false`, and calls
   `GameUI.beginDeathTransition(request)`.
3. `GameUI` asks `chooseDeathTransition()` for a variant, starts the
   `DeathTransitionController`, and keeps the existing animation loop alive.
4. When the transition resolves, `main.ts` flips
   `ui.endRunPresentationReady = true`, allowing `EndRunScreen.svelte` to open
   the existing ending art curtain and stats.

Already-ended restored saves skip the animation and open the end screen
immediately. Restarting or starting a new game resets any inline transition
styles before the live map renders again.

## Adapter Contract

`src/ui/deathTransition.ts` mirrors the floor-transition registry pattern:

- a `DeathTransition` is a pure `{ id, label, durationMs, apply(p, ctx) }`
  adapter;
- `apply()` receives normalized progress in `[0, 1]`;
- adapters write only through `DeathTransitionContext` setters for plane
  transform/filter/opacity/origin and the map-local veil overlay;
- `DeathTransitionController` binds those setters to `.map-plane` and
  `.map-death-veil`;
- `prefers-reduced-motion` resolves to the short opacity-only `dissolve`
  fallback.

Adding a variant should be one registry entry plus tests that sample the effect
at the start/end and cover any distinctive motion.

Dev builds expose `window.__roguePreviewDeathTransition(id)` for browser proof
and tuning. It plays a named registry entry through the same `GameUI` controller
without changing the real random death-selection path.

## Shipped Variants

- `last-spiral` — blur, desaturate, rotate, and recede the map into darkness.
- `torch-out` — dim the board while a radial shadow closes down around the map.
- `fold-shut` — rotate and compress the plane as if the dungeon folds closed.
