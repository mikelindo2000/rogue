# Monster Combat Portrait

## Context

When the player fights a monster there's no large visual of the foe on the board — monsters are
single glyphs. We have pre-generated portrait art for every monster in `public/bestiary/` (used
today only in the bestiary/compendium modals). This feature surfaces that art *during combat*: an
oval, framed portrait of the monster you're fighting fades in over the map when a fight begins and
fades out when it ends.

Hard constraint from the request: **the portrait must never cover the map itself.** It sits in a
corner of the board, picks a different corner if its footprint would overlap a drawn room/corridor,
and shows nothing if no corner is clear.

### Decisions (confirmed with user)
- **Fight = adjacency.** Portrait fades in when a hostile monster is adjacent (8-neighborhood) to
  the player; fades out when no hostile monster is adjacent (it died or the player stepped away).
- **Focus = last-attacked.** Among adjacent hostile monsters, show the one most recently struck;
  fall back to the nearest adjacent hostile if that one is gone.
- **Anchor = canvas corners.** "Not covering the map" is about canvas content, so the oval anchors
  to a corner of the board canvas and we test its footprint against *drawn* tiles.

## How the pieces connect (from exploration)

- Render is HTML5 Canvas 2D driven by `GameUI` (`src/ui.ts`); Svelte chrome renders from the
  reactive snapshot store `ui` (`src/ui/store.svelte.ts`). Engine writes a snapshot each turn via
  `GameUI.updateStats()` / `render()`; no event emitter.
- The board canvas (`#gameCanvas`) lives inside `.map-viewport` in
  `src/ui/components/CenterStage.svelte`. `.map-viewport` shrink-wraps the canvas, so an
  absolutely-positioned child of it anchors directly to canvas corners — **no `getBoundingClientRect`
  math needed**, and it sits above the 3D rumble plane so the portrait stays crisp/stable.
- Existing center-stage overlays (`stairs-pill`, `MonsterTooltip`, `aim-prompt`) are the pattern to
  follow: gated by an `ui.*` field, positioned absolutely in the stage.
- Monster art URL: `monsterArtUrl(monster)` → `/bestiary/${monsterId(monster)}.png`
  (`src/ui/monsterArt.ts`, `src/discovery.ts`). Coverage is enforced by
  `src/assetManifest.test.ts` / `scripts/audit-assets.mjs`, so every spawnable monster has art.
- A tile is **drawn map** exactly when `s.explored[r][c] && s.map[r][c] !== TILE.VOID` — the gate in
  the paint loop (`src/ui.ts:426-428`). This is the occupancy test reused for collision.
- `Monster` (`src/types.ts`) has `name`, optional `id`, `x`, `y`, `hp`, `maxHp?`, `color`, `symbol`.
  The snapshot already exposes `s.monsters`, `s.map`, `s.explored`, `s.cols/rows`, plus
  `computeTileSize()` for tile px size. `MonsterTemplate` is what `monsterArtUrl` wants — the live
  `Monster` carries the same `id`/`name`, so it resolves correctly.

## Implementation

### 1. Track the last-attacked monster (engine)
`src/engine.ts` — in `playerAttack(m)` (~line 1047) record the focus target:
```ts
this.lastAttackedId = m.id ?? slugify(m.name);
```
Add the `lastAttackedId?: string` field. Clear it in `handleMonsterDeath()` when the dead monster
matches (optional; the adjacency filter below already handles a dead target disappearing). Use the
existing `monsterId()` helper rather than re-deriving the slug.

### 2. Compute the portrait snapshot (GameUI)
New private method `GameUI.computeCombatPortrait(s, tileSize)` in `src/ui.ts`, returning
`CombatPortrait | null`. Called once per turn from the same place `updateStats` writes overlay
fields (alongside the existing `nearbyMonster` computation, ~ui.ts:1699). Steps:

1. **Find adjacent hostiles:** `s.monsters` where `max(|m.x-px|,|m.y-py|) <= 1` and visible/hostile.
   If none → return `null` (drives fade-out).
2. **Pick focus:** the adjacent monster whose `monsterId` === `engine.lastAttackedId`; else the
   nearest adjacent.
3. **Size:** `sizePx = clamp(round(min(cols,rows) * tileSize * 0.28), 96, 200)`. Convert to a tile
   footprint `tilesW/H = ceil(sizePx / tileSize)` (+1 tile inset margin).
4. **Choose a corner** via `pickFreeCorner()` (below). If none free → return `null`.
5. Return `{ id: monsterId(focus), name, color: focus.color, hp, maxHp, corner, sizePx }`.

`pickFreeCorner(s, tilesW, tilesH)`:
- Corner candidates in priority order, **farthest-from-player first** (so the portrait sits away
  from the action): order the four corners by Chebyshev distance of the corner tile from the player.
- For each corner, scan its `tilesW × tilesH` block of tiles. A block is **blocked** if any tile is
  drawn map (`s.explored[r][c] && s.map[r][c] !== TILE.VOID`) OR holds a visible monster/item. Use an
  inscribed-ellipse test (only count tiles within the oval's radius) so square-corner tiles just
  outside the oval don't false-positive.
- Return the first unblocked corner, or `null`.

Write to the store with change-detection so the rAF loop doesn't thrash reactivity — only assign
`ui.combatPortrait` when `id`/`corner`/`sizePx`/`hp` actually change (compare to a cached last value,
same approach the overlay sync already uses for `nearbyMonster`).

### 3. Store field
`src/ui/store.svelte.ts` — add to `UIState` and the initial `ui`:
```ts
combatPortrait: CombatPortrait | null;  // initial: null
```
with an exported interface:
```ts
export interface CombatPortrait {
  id: string;        // bestiary slug -> /bestiary/${id}.png
  name: string;
  color: string;     // monster palette color, for the frame accent
  hp: number;
  maxHp: number;
  corner: 'tl' | 'tr' | 'bl' | 'br';
  sizePx: number;    // oval diameter in CSS px
}
```

### 4. Portrait component
New `src/ui/components/MonsterPortrait.svelte`, mounted inside `.map-viewport` in
`CenterStage.svelte` (sibling of `.map-transition`, before `.map-ghost`):
```svelte
{#if ui.combatPortrait}
  <MonsterPortrait portrait={ui.combatPortrait} />
{/if}
```
- Absolutely positioned to the corner from `portrait.corner` (e.g. `tl` → `top/left` inset ~10px),
  width/height = `portrait.sizePx`.
- Oval mask: `border-radius: 50%; overflow: hidden;` on a wrapper; `<img src={"/bestiary/"+id+".png"}>`
  with `object-fit: cover` (background-position favoring the top so faces aren't cropped). Build the
  URL inline from `id` (avoids needing the full `Monster` for `monsterArtUrl`).
- **Cool frame:** layered ring — an outer `box-shadow`/`border` in `var(--border-chip)` plus an inner
  accent ring tinted from `portrait.color` (e.g. `box-shadow: 0 0 0 2px color, 0 8px 24px rgba(0,0,0,.5)`),
  and a subtle inner vignette gradient so the art reads against the frame. Reuse existing tokens
  (`--surface-overlay`, `--r-*`) for consistency with the other overlays.
- Optional thin HP arc/bar under the frame from `hp/maxHp` (nice-to-have; keep if cheap).
- **Fade in/out:** Svelte `transition:fade={{ duration: 280 }}` on the root `{#if}` so it eases in on
  mount and the node lingers to ease out when `combatPortrait` goes null. Guard with
  `prefers-reduced-motion` (instant show/hide) to match the project's reduced-motion stance.
- `pointer-events: none`, `z-index` above the canvas/vignette but below modals (mirror the
  `stairs-pill`/`aim-prompt` stacking, z ~3-4).

## Files
- `src/engine.ts` — `lastAttackedId` field + set in `playerAttack` (+ optional clear on death).
- `src/ui.ts` — `computeCombatPortrait` / `pickFreeCorner`; call in the overlay-sync path; write
  `ui.combatPortrait` with change-detection.
- `src/ui/store.svelte.ts` — `CombatPortrait` interface + `combatPortrait` state field.
- `src/ui/components/MonsterPortrait.svelte` — new oval/framed component with fade.
- `src/ui/components/CenterStage.svelte` — mount the component inside `.map-viewport`.

## Verification
- `npm run dev`, start a run, walk into a monster. Confirm the oval portrait fades in in a board
  corner, shows the correct monster art, and does **not** overlap any room/corridor. Kill it (or
  step away) and confirm it fades out.
- Move so the only free corners are blocked by rooms (fight in an open central room): confirm the
  portrait relocates to a clear corner, and in a fully-walled-in spot confirm it simply doesn't show.
- Engage two adjacent monsters; attack one then the other — confirm the portrait follows the
  last-attacked one.
- Resize the window mid-fight: portrait rescales/repositions sensibly (recompute on repaint).
- `npm test` (asset manifest + existing suites stay green); `npm run audit:assets` for art coverage.
- Verify with the preview MCP: `preview_start`, drive into combat via `preview_*`, `preview_screenshot`
  to capture the faded-in portrait as proof.
```
