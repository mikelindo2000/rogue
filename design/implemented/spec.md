# Roguelike UI Redesign — Implementation Spec

Source of truth: Claude Design project **"Modern roguelike redesign"** (`Roguelike
Redesign.dc.html`). This spec translates that mockup into a modular Svelte 5
component library wrapped around the **unchanged** dungeon `<canvas>`.

## Golden rules

1. **Do not change the game board.** The dungeon canvas (`GameUI.render`,
   `src/theme.ts`, `src/tiles.ts`) and all game logic stay exactly as-is. We only
   build the chrome around it.
2. **Tokens only.** Never hardcode a hex/px-color. Use `var(--…)` from
   `src/ui/styles/tokens.css`. Spacing/radii/fonts likewise use tokens where one
   exists; raw px for one-off geometry is fine.
3. **Svelte 5 runes.** `<script lang="ts">`, props via `$props()`, local state via
   `$state`, derived via `$derived`. Read shared state by importing `{ ui }` from
   `src/ui/store.svelte.ts`.
4. **Scoped styles.** Each component owns its CSS in its `<style>` block. Tokens
   are global; everything else is component-local.
5. **Accessibility.** Interactive elements are real `<button>`s with
   `aria-label`s; bars use `role="progressbar"` with aria values; decorative SVG
   gets `aria-hidden="true"`.
6. **Reduced motion** is handled globally; still prefer transform/opacity
   transitions over layout-thrashing ones.

## File layout

```
src/ui/
  styles/{tokens,global}.css   # DONE — global tokens + base
  icons.ts                     # DONE — IconName + ICONS registry + SLOT_ICON
  format.ts                    # DONE — rarityVar, hungerView, floorName, titleCase
  store.svelte.ts              # DONE — `ui` state + `actions`
  components/
    primitives/                # shared building blocks (Group P)
    *.svelte                   # region components (Groups L/R/M)
  App.svelte                   # composition root
  mount.ts                     # mounts App into #app
```

Component import convention: `import Icon from './primitives/Icon.svelte';`

---

## App frame & layout

The mockup is a fixed 1440×900 rounded card centered on a `--surface-page`
backdrop. For the real app, **fill the viewport**: the frame is a flex column at
`100vw × 100vh` (no outer border-radius/shadow needed when full-bleed; keep them
only if we later letterbox). Structure:

```
<div class="frame">                       bg var(--surface-app); flex column
  <TopBar/>                                height var(--bar-h) 54px
  <div class="body"> flex row, flex:1, min-height:0
    <aside class="rail-left">              width var(--rail-left-w) 264px; border-right var(--border); bg var(--surface-rail)
      <CharacterCard/>                      border-bottom var(--border-subtle)
      <Vitals/>                             border-bottom var(--border-subtle)
      <Equipment/>                          flex:1, scrolls
      <Consumables/>                        border-top var(--border-subtle)
    <CenterStage/>                          flex:1, min-width:0, bg var(--surface-map)
    <aside class="rail-right">             width var(--rail-right-w) 312px; border-left var(--border); bg var(--surface-rail)
      <Inventory/>                          border-bottom var(--border-subtle)
      <MessageLog/>                         flex:1
  <Footer/>                                height var(--footer-h) 38px (toggle via ui? always show)
</div>
```

`App.svelte` owns the frame + the three columns and renders `<Compendium/>` as an
overlay sibling. The canvas element lives inside `CenterStage`.

---

## Group P — Primitives (`components/primitives/`)

### Icon.svelte
- Props: `name: IconName`, `size?: number = 18`, `stroke?: number = 1.5`.
- Renders `<svg viewBox="0 0 24 24" width/height=size fill="none"
  stroke="currentColor" stroke-width={stroke} stroke-linecap="round"
  stroke-linejoin="round" aria-hidden="true">{@html ICONS[name]}</svg>`.
- Color comes from the parent's `color`/`currentColor`.

### SectionLabel.svelte
- The uppercase rail/section header. Props: `text: string`, optional `trailing`
  snippet (right-aligned meta like "7 slots").
- Style: `font: 600 var(--fs-label)/1 var(--font-display);
  letter-spacing: var(--tracking-caps); text-transform: uppercase;
  color: var(--text-dimmer);`

### SegmentedBar.svelte (health)
- Props: `value: number`, `max: number`, `segments?: number = 10`.
- Renders `segments` equal flex children, 11px tall, `--r-sm`-ish (3px) radius,
  gap 3px. Filled = `var(--hp)`; the last filled segment when `value/max` is low
  (≤ ~30%) = `var(--hp-low)`; empty = `var(--hp-empty)`.
- `role="progressbar"` aria-valuenow/min/max.

### ProgressBar.svelte (xp)
- Props: `value`, `max`, `from?`, `to?` gradient tokens (default `--xp-from`/`--xp-to`).
- 5px tall track `var(--surface-inset-2)`, radius 3px; fill is a
  `linear-gradient(90deg,var(--xp-from),var(--xp-to))` at `value/max` width with a
  `width var(--dur-slow) var(--ease)` transition.

### ProgressRing.svelte (hunger)
- Props: `pct: number`, `label: string`, `color?: string = var(--good)`,
  `size?: number = 56`.
- SVG ring: track circle `var(--surface-inset-2)` stroke 5, value circle `color`
  stroke 5 round-cap, `stroke-dasharray`/`offset` from pct, rotated -90°. Center
  text shows `${pct}%` in `var(--text-bright)`. Caption below = `label` in caps,
  `var(--fs-micro)`, color matches tone.

### KeyCap.svelte
- Props: `key: string` (children/text). Inline-flex pill: min-width 18px, height
  18px, padding 0 5px, `bg var(--surface-raised)`, `border 1px var(--border-strong)`
  with `border-bottom-width: 2px`, radius `--r-xs`, font `600 11px var(--font-display)`,
  color `var(--text-keycap)`.

### RarityDot.svelte
- Props: `color: string`, `glow?: boolean`. 6px round dot; when `glow`, add
  `box-shadow: 0 0 6px <color@.5>` — pass the glow as a prop or derive via
  color-mix. Use `box-shadow: 0 0 6px color-mix(in srgb, currentColor 50%, transparent)`
  with the dot's `color` set to the rarity color.

### Popover.svelte
- Anchored floating menu (used by Equipment slots + Consumables potion button).
- Props: `open: boolean` (bindable), `anchor?` alignment. Slotted trigger + panel
  snippets, OR: render `children` as the panel and let the caller wrap a trigger.
  Recommended API: `{#snippet trigger()}…{/snippet}` and `{#snippet panel()}…{/snippet}`.
- Panel: `bg var(--surface-popover)`, `backdrop-filter: blur(8px)`,
  `border 1px var(--border-popover)`, radius `--r-xl`, `box-shadow var(--shadow-pop)`,
  z-index above rails. Opens with a quick scale/opacity (`--ease-spring`).
- On open/close, call a passed `onOpenChange` so the shell can suspend movement
  keys (mirrors the old dropdown-state-change). Close on outside-click and Escape.
- Keyboard: arrow up/down to move highlight, Enter to choose, Escape to close.

### Modal.svelte
- Full-screen overlay used by the Compendium. Props: `open` (bindable), `title?`,
  `onClose`. Backdrop `rgba(0,0,0,.6)` + `backdrop-filter: blur(8px)`; window
  `bg var(--surface-app)`, `border 1px var(--border-popover)`, radius `--r-2xl`,
  `box-shadow var(--shadow-pop)`. Centered, max ~80vw/80vh. Traps focus; Escape and
  backdrop-click close. Open/close transition via `--ease-spring`.

---

## Group L — Top bar + Left rail

### TopBar.svelte  (reads `ui`)
- Height `--bar-h`, padding `0 20px`, `bg var(--surface-bar)`,
  `border-bottom 1px var(--border)`. Flex row, space-between.
- **Left:** logo tile (30×30, `--r-md`, `bg var(--surface-inset-2)`,
  `border 1px var(--border-slot)`, `color var(--accent)`, display font `>`), then a
  2-line block: line 1 = `Floor {ui.floor} / {ui.floorMax}` (caps label,
  `var(--fs-micro)`→ use ~9.5px, `var(--tracking-caps-wide)`, `var(--text-dimmer)`);
  line 2 = `{ui.floorName}` (`600 14px var(--font-display)`, `--tracking-tight`,
  `var(--text-bright)`).
- **Right:** three `StatChip`s — gold (`coin` icon stroke `var(--accent-strong)`,
  value `ui.gold`, unit "gold"), defense (`shield` icon stroke `var(--text-muted)`,
  value `ui.def`, unit "def"), turn ("Turn" label + `ui.turn`). Make a small inline
  chip or a `StatChip` primitive — your call, but keep it consistent. Chip: height
  30px, padding `0 11px`, gap 7px, `bg var(--surface-inset)`,
  `border 1px var(--border-chip)`, radius `--r-md`; value `600 var(--fs-value)
  var(--font-display)` `.tnum` `var(--text-bright)`; unit `500 11px var(--font-ui)
  var(--text-dimmer)`.

### CharacterCard.svelte (reads `ui`)
- Padding 16px, `border-bottom 1px var(--border-subtle)`, flex row gap 12px.
- Avatar: 44×44, `--r-lg`/10px, `bg #11131a` → use `var(--surface-inset-2)`,
  `border 1px var(--border-strong)`, `color var(--accent)`,
  `700 22px var(--font-display)`, `text-shadow 0 0 10px var(--accent-glow)`, shows
  `ui.glyph`.
- Text: name `ui.charName` (`600 var(--fs-title-lg) var(--font-display)`,
  `--tracking-tight`, `var(--text-bright)`); sub `Level {ui.level} · {ui.charClass}`
  (`500 12px var(--font-ui) var(--text-label)`).

### Vitals.svelte (reads `ui`)
- Padding 16px, `border-bottom 1px var(--border-subtle)`, column gap 16px.
- **Health block:** header row — `SectionLabel "Health"` + right value
  `{ui.hp} / {ui.maxHp}` where current is `var(--hp)` and `/ max` is
  `var(--text-dimmer)`, `600 12.5px var(--font-display) .tnum`. Below: `SegmentedBar
  value={ui.hp} max={ui.maxHp}`.
- **Row:** xp (flex:1) + hunger ring (fixed), gap 14px.
  - xp: header `SectionLabel "Experience"` + right `Lv {ui.level}`
    (`600 11px var(--font-display) var(--xp-label)`). `ProgressBar value={ui.xp}
    max={ui.xpReq}`. Caption `{ui.xp} / {ui.xpReq}` (`500 var(--fs-xs)
    var(--font-display) var(--text-dimmer) .tnum`); when `ui.atMaxLevel`, show
    "MAX LEVEL".
  - hunger: `ProgressRing pct={ui.hungerPct} label={ui.hungerStatus}` with ring
    color by tone (ok→`--good`, warn→`--accent-strong`, low→`--hp-low`,
    crit→`--danger`).

### Equipment.svelte + EquipSlot.svelte (reads `ui.equipment`, calls `actions.equip`)
- Header: `SectionLabel "Equipment"` with trailing `{n} slots` (count of slots).
  Padding ~14px 12px 8px.
- List: scrollable column (`flex:1; overflow-y:auto`), gap 1px, padding `0 8px 8px`.
- **EquipSlot** row (per `EquipSlotView`): a `<button>` (whole row clickable to open
  its picker) — flex row, gap 11px, padding 8px, radius `--r-md`. The currently
  *filled* main-hand style row has `bg var(--surface-card)`; others transparent
  until hover (`bg var(--surface-card)` on hover).
  - icon tile 32×32, `--r-md`, `border 1px var(--border-slot)`; filled tile
    `bg var(--surface-inset-2)` colored by rarity (icon `color` = the slot's
    rarityColor for filled, or tint per design); empty tile `bg var(--surface-card)`,
    `border 1px dashed var(--border-slot)`, icon `color var(--text-faintest)`.
  - text: slot label (`600 var(--fs-slot-label) var(--font-display)` caps,
    `var(--tracking-caps)`→ use .12em, `var(--text-dimmer)`) + item name
    (`600 var(--fs-body) var(--font-ui)`, color = `slot.rarityColor`, ellipsis).
    Empty: name "Empty" `500 var(--fs-body) var(--text-faint)`.
  - trailing `RarityDot` (color = rarityColor; glow when uncommon+) when filled.
  - Clicking opens a `Popover` listing `slot.options`; choosing one calls
    `actions.equip(slot.slot, option.value)`. The currently-selected option is
    marked. Disabled options (e.g. "Disabled (2H Weapon)") are non-selectable.

### Consumables.svelte (reads `ui`, calls `actions.usePotion` / `actions.eat`)
- Padding 12px, `border-top 1px var(--border-subtle)`, flex row gap 8px.
- **Use potion** button (flex:1, height 38px, radius `--r-lg`,
  `bg var(--surface-inset)`, `border 1px var(--border-slot)`,
  `color var(--text)`, `600 12px var(--font-ui)`): `potion` icon stroke
  `var(--info)`, text "Use potion", trailing count `ui.potions.length`
  (`var(--text-dimmer)`). Clicking opens a `Popover` of `ui.potions` →
  `actions.usePotion(idx)`. Disabled (faded) when no potions.
- **Eat** button (flex:1, height 38px, radius `--r-lg`,
  `bg var(--accent-surface)`, `border 1px var(--accent-border)`,
  `color var(--accent)`): `leaf` icon, text "Eat", trailing `{ui.food}/{ui.foodMax}`
  (`var(--accent-deep)`). Calls `actions.eat()`. Disabled when `ui.food === 0`.

---

## Group R — Center stage + Right rail + Footer

### CenterStage.svelte
- `flex:1; position:relative; bg var(--surface-map)`, centers its content,
  `overflow:hidden; min-width:0`.
- Contains the **canvas**: `<canvas id="gameCanvas" width="920" height="580">`.
  Keep this exact id/size (the engine binds to it). Center it. The board art is
  unchanged.
- Stairs pill (top-left, `position:absolute; top:14px; left:14px`): shown when
  `ui.stairsNearby`. Height 28px, padding `0 11px`, gap 8px,
  `bg var(--surface-overlay)`, `backdrop-filter: blur(6px)`,
  `border 1px var(--border-chip)`, radius `--r-md`, z-index 3. Accent `>`
  (`700 12px var(--font-display) var(--accent)`) + "Descend stairs nearby"
  (`500 var(--fs-sm) var(--font-ui) var(--text-muted)`).
- Vignette overlay: `position:absolute; inset:0; pointer-events:none; z-index:2;
  background: radial-gradient(130% 120% at 52% 46%, transparent 46%, rgba(0,0,0,.6));`
- `MonsterTooltip` overlay (z-index 4) when `ui.nearbyMonster`.
- Also render a game-over / victory overlay card when `ui.gameOver` /
  `ui.gameWon` (centered, accent/danger framed, "Press R to restart"). Keep it
  tasteful and token-driven.

### MonsterTooltip.svelte (reads `ui.nearbyMonster`)
- Floating card (the design centers it over the player; place it top-center of the
  stage, e.g. `position:absolute; top:18px; left:50%; transform:translateX(-50%)`
  is acceptable since we can't easily track the player's pixel position — OR
  bottom-center. Pick one, keep it out of the way). Width ~196px,
  `bg var(--surface-popover)`, `backdrop-filter: blur(8px)`,
  `border 1px var(--border-popover)`, radius `--r-xl`, `box-shadow var(--shadow-pop)`,
  padding `11px 12px`.
- Header: glyph chip 26×26 (`--r-sm`, danger-tinted bg/border, monster `color`,
  `700 14px var(--font-display)`, shows `glyph`) + name
  (`600 13px var(--font-ui) var(--text-bright)`) + state ("hostile" in
  `var(--danger)`, `500 10.5px`) + right-aligned subtitle if any
  (`var(--text-label)`).
- HP bar: thin track (5px, `var(--surface-inset-2)`) filled `var(--danger)` at
  `hp/maxHp`; trailing `{hp}/{maxHp}` (`600 10.5px var(--font-display) .tnum
  var(--text-muted)`).
- Optional subtitle line in `var(--text-dim)`.

### Inventory.svelte + ItemSlot.svelte (reads `ui.inventory`, `ui.inventoryCount/Max`)
- Header: `SectionLabel "Inventory"` + trailing `{ui.inventoryCount} / {ui.inventoryMax}`
  (`600 10.5px var(--font-display) .tnum var(--text-dimmer)`). Padding `14px 14px 6px`.
- Grid: `display:grid; grid-template-columns:repeat(5,1fr); gap:7px;
  padding:6px 12px 14px; border-bottom 1px var(--border-subtle)`.
- **ItemSlot** (per `InventoryCell`): `aspect-ratio:1; border-radius:--r-lg;
  display:flex; center`. Filled: `bg var(--surface-card)` tinted by rarity,
  `border 1px <rarityColor>` (the design uses a darker rarity-tinted border + a
  faint `inset 0 0 14px rarity@.1` glow for colored items), icon stroke =
  rarityColor, size 20. Count badge bottom-right when `count` set
  (`600 9.5px var(--font-display) var(--text-label)`). Empty cell:
  `bg #0b0d11`→ use `var(--surface-page)`, `border 1px dashed var(--border-dashed)`,
  no icon. Render `ui.inventoryMax` cells total (fill the grid with empties up to
  the max). Make filled cells `<button>`s for future interaction (no action yet —
  but give an `aria-label` of `cell.label`).

### MessageLog.svelte + LogLine.svelte (reads `ui.logs`)
- Header: `SectionLabel "Message log"` + a small `var(--accent)` status dot with
  glow (`box-shadow 0 0 6px var(--accent-glow)`). Padding `14px 14px 8px`.
- Body: `flex:1; overflow-y:auto; padding:0 14px 14px; display:flex;
  flex-direction:column; justify-content:flex-end` (newest at the bottom). Auto-
  scroll to bottom on new lines (`$effect`).
- **LogLine** (per `LogLineView`): flex row gap 9px, padding `5px 0`. Gutter:
  `n` right-aligned, width 22px, `600 10.5px var(--font-display) .tnum
  var(--text-faintest)`. Message: `400 var(--fs-body)/1.45 var(--font-ui)
  var(--text-muted)` — render via `{@html line.html}` (the engine produces small
  colored spans for item names/damage). When `line.highlight`, wrap with the loot
  treatment: `padding:7px 9px; margin-top:3px; bg var(--accent-log-surface);
  border-left:2px solid var(--accent); border-radius:0 8px 8px 0`, gutter color
  `var(--accent-deep)`, message `var(--text)`.

### Footer.svelte
- Height `--footer-h`, padding `0 18px`, `bg var(--surface-bar)`,
  `border-top 1px var(--border)`. Flex row, gap 18px, align center.
- Hint = `KeyCap` + label (`500 var(--fs-sm) var(--font-ui) var(--text-dim)`).
  Hints: `↑↓←→` move, `Shift` run, `i` inventory, `e` eat, `m` bestiary; then
  right-aligned (`margin-left:auto`) `?` all shortcuts.

---

## Group M — Compendium

### Compendium.svelte (uses Modal)
- Rewrite of the old `<monster-compendium>` web component as a Svelte modal.
- Open state from `ui.compendiumOpen`; closing calls `actions.setCompendiumOpen(false)`.
- Reads `MONSTER_DATABASE` from `src/config.ts` (import it). Renders a search input
  (filter by name/symbol, case-insensitive) + a responsive grid of monster cards.
- **Monster card:** glyph chip (monster `color`), name, key stats (hp, atk,
  min floor). Boss entries (`special === 'boss'`) get the legendary/gold treatment
  (`border var(--rarity-legendary)`, subtle gold gradient bg). Use tokens; match
  the dark card aesthetic of the rest of the UI.
- Title "Bestiary" or "Monsters". Search input styled with tokens; typing must not
  trigger game shortcuts (the KeyboardManager already guards form inputs; the modal
  is an overlay so movement is suspended anyway).

---

## Data the store exposes (already defined in `store.svelte.ts`)

Read these; do not invent fields. `ui.equipment: EquipSlotView[]`,
`ui.inventory: InventoryCell[]`, `ui.potions: PotionOption[]`,
`ui.logs: LogLineView[]`, `ui.nearbyMonster: NearbyMonster | null`, plus the scalar
stat fields. `actions.equip/usePotion/eat/restart/setCompendiumOpen` are the only
side-effect hooks. The engine populates everything via `src/ui.ts`.
```
