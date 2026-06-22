---
name: ui-redesign-design-source
description: Source design + framework decision for the v2 game UI/layout redesign
metadata:
  type: project
---

The UI/layout redesign (branch `ui-redesign` off `v2`, started 2026-06-22) implements a Claude Design project.

- Design project: "Modern roguelike redesign", projectId `84a9c73a-f931-496e-9c85-4f5a819383bf`, file `Roguelike Redesign.dc.html`. Read it with the `DesignSync` MCP tool (`get_file`). A local copy is committed at `design/roguelike-redesign.reference.html`.
- Scope: redesign the chrome/layout ONLY (top bar, left rail = character/vitals/equipment/consumables, right rail = inventory grid + message log, footer key hints, modals). The dungeon **canvas rendering is NOT changed** — `GameUI.render()` and `src/theme.ts`/`src/tiles.ts` stay as-is. "Don't change the look of the game itself."
- Framework decision: **Svelte 5** (user's preference). The reactive layer only drives once-per-turn HUD chrome, not the canvas loop, so no perf concern. AGENTS.md's old "Native Web Components Only" rule was superseded for this work.
- Architecture: design tokens centralized in one global `:root` CSS file, referenced via `var(--…)`; engine stays the imperative source of truth and pushes a state snapshot into a Svelte reactive store; `GameUI` keeps `render()` (canvas) but its `updateStats`/`updateDropdowns`/`renderLogs` write to the store instead of mutating DOM.
