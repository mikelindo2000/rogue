# Agent Guidelines
Agents: use the CLI tool td to manage tasks. You're going to love it, if not, complain to the operator about it and he'll fix it.

Here we commit changes to git as we work. Try to only commit your changes but if you find other work that's clearly intentional but has been left uncommitted other agents (sometimes there are multiple agents working at the same time, we avoid it but... it happens, in that case, leave their work for them to commit but if it's a cchange from hours / days ago, it's okay to sweep in or add to a separate commit and mention in your summary) . 

## Keyboard-First Gameplay

Rogue must be fully playable from the keyboard, in the spirit of the original Rogue. Every gameplay feature, modal, menu, picker, overlay, and repeated UI control needs keyboard parity with pointer controls before it is considered complete.

- Keep global game shortcuts active only in the appropriate gameplay context.
- Scope modal and overlay shortcuts to the active modal so they do not leak into movement or other global actions.
- Make arrow keys navigate selectable lists, grids, menus, and action groups.
- Make Return activate the focused or selected command.
- Add mnemonic shortcuts where they match Rogue-style verbs, such as `e` for equip, without breaking existing global shortcuts.
- Preserve focus visibly and predictably after opening, closing, changing selection, or performing an action.
- Include keyboard behavior in verification for any UI or gameplay feature.

## Sound & Audio Assets

Rogue has a sound-effects and music layer. Two docs govern it — read them before touching audio:

- [`design/implemented/sound_effects_system_plan.md`](design/implemented/sound_effects_system_plan.md) — the architecture: typed `SoundEvent`s emitted by `GameEngine` through a `SoundSink`, resolved to assets by the audio service. The engine never knows filenames or calls ElevenLabs.
- [`design/implemented/sound_effect_asset_prompts.md`](design/implemented/sound_effect_asset_prompts.md) — the **house production guide**: the sonic identity, the exact reproducible prompt for every clip, the ElevenLabs generation recipe, naming/layout, and the music catalogue.

Rules:

- Never call ElevenLabs (or any audio-generation API) from runtime/game code. Generation is an offline asset-production step. The game ships only the local files under `public/audio/` and the manifest that indexes them.
- Every sound-worthy event must keep its visual/log feedback. Sound is additive; it is never the only feedback.
- **Adding a monster:** combat/death cues resolve by a cascade (`monsterId → archetype → special → generic`), so most monsters need no new asset. Only author a clip for a signature creature or a new archetype. When you do, follow the house guide, append the new asset's prompt to its table, regenerate with the recipe, and add a manifest entry — never add a one-off `emit` call per creature.
- **Adding an event/cue:** add the `SoundEvent` in `src/audio/events.ts`, emit it from the relevant engine path, then add the asset + prompt row in the house guide and a manifest entry. Keep prompts in the guide so every clip stays reproducible.
- The ElevenLabs API key lives in `~/.secrets` (`ELEVENLABS_API_KEY`); never echo or commit it.

## Worktrees

Building a feature in an isolated git worktree? See [`WORKTREES.md`](WORKTREES.md).
Short version: `scripts/worktree-new.sh <branch> [base]` creates a sibling
worktree, then `scripts/worktree-dev.sh` installs deps and serves it on a free
port. The repo pins port 3000 with `strictPort`, so always start dev servers via
that script (or set `PORT`) when more than one checkout is running — otherwise the
second server fails to bind.

## Map 3D plane

The dungeon canvas sits on its own 3D plane (`.map-viewport > .map-transition >
.map-plane` in `CenterStage.svelte`), independent of the background art and HUD,
so it can be shaken/tilted/transitioned for cosmetic effect. `MapStageController`
(`src/ui/mapStage.ts`) owns the plane's transform and is ticked by `GameUI`'s
existing rAF loop; effects are purely cosmetic and collapse to identity under
`prefers-reduced-motion`. Phase 1 ships the heavy-hit rumble (`GameUI.mapRumble`,
gated by `isHeavyHit` in `src/combat.ts`), and Phase 2 ships floor transitions
through `FloorTransitionController` (`src/ui/floorTransition.ts`). Roadmap + the
pointer→tile caveat: [`design/active/map_3d_plane_plan.md`](design/active/map_3d_plane_plan.md).
