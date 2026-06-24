# design/planning

Forward-looking design plans that are scoped but not yet scheduled. When a plan is
picked up for implementation, move it to `design/active/`; when shipped, to
`design/implemented/` (see the existing folders for the lifecycle).

## Plans in this batch — magic items & systems chemistry

Three related item-system expansions, designed together so they share conventions
and don't collide:

- **[Rings of Enchantment](rings_of_enchantment_plan.md)** — left/right-hand ring
  slots at full original-Rogue parity (Protection, Add Strength, Regeneration,
  Slow Digestion, Searching, Stealth, Sustain Strength, Maintain Armor, See
  Invisible, Adornment, and the cursed Aggravate Monster / Teleportation), with
  Rogue's food-upkeep tension and room for rarity/enchant scaling, identification,
  and curses.
- **[Wands & Staves](../implemented/wands_and_staves_plan.md)** — zappable arcane items at
  original-Rogue catalog parity, using the **Rogue: DungeonMaster no-charges
  model** (persistent items gated by cooldown/hunger rather than finite charges).
  Introduces the engine's first ranged/targeting subsystem and reconciles the
  naming collision with the existing melee `staff` weapon type.
- **[Potion Dipping](potion_dipping_plan.md)** — a data-driven "systems chemistry"
  framework letting the player dip carried items into potions to create coatings,
  blessed food, and diluted potions, with a starter interaction matrix over the
  four existing potions.
- **[Scrolls Overhaul](scrolls_overhaul_plan.md)** — converts scrolls into a
  first-class carried/read item line with a typed catalog, scroll-focused
  inventory browsing, filters by type/tier/floor band, keyboard-first reading,
  and generated full inventory art for every scroll.
- **[Visual Effect Layers](visual_effect_layers_plan.md)** — generalizes the
  existing hunger/low-HP HUD wash into layered chrome and stage effects, including
  the first green-fog floor atmosphere.

## Cross-cutting concerns (read before implementing any one of them)

These three plans all touch the same seams. Coordinate so they integrate cleanly:

1. **Savegame version** (`src/persistence/savegame.ts`, currently `VERSION = 2`).
   Each plan bumps it and adds shape validation + migration. **If two or more ship
   together, do a single combined bump** rather than stacking sequential versions.
   Each plan documents its own delta.
2. **`InventoryRef` / `EquipSlot` / `EquipTarget` / `Inventory` unions**
   (`src/types.ts`). Rings add `{ kind: 'ring' }` and ring slots; wands add a wand
   ref/section; dipping reuses `InventoryRef` for its target handle. Extend the
   unions in one coherent pass and keep the `player.ts` validation
   (`canEquip`/`equipValidated`/`inventoryRefToEquipTarget`) exhaustive.
3. **Identification & curses.** None of these exist yet (everything spawns
   identified, nothing is cursed). All three plans defer ID/curses to a later phase
   and reuse the `src/discovery.ts` meta-progression pattern when built. An
   identification system is effectively a shared prerequisite for the "full Rogue"
   end-state of all three — consider planning it as its own document next.
4. **Ranged / targeting.** The wands plan builds the engine's first targeting
   subsystem. The potion-dipping plan's poison-coating expansion and any future
   thrown weapons should reuse it — don't build a second one.
5. **Optional `GearItem` fields.** Dipping adds `coating?`; the gear-health system
   already added `health?`. New optional fields must be normalized on load
   (`normalizeAllGearHealth` is the pattern) and validated in the save guard.
6. **Keyboard parity** is enforced project-wide: every mouse affordance needs a key
   binding (`src/keyboard.ts`). Proposed keys — `P` put on ring, `z` zap wand,
   `d` dip — should be reconciled against current bindings together to avoid
   collisions (note `r` already reads scrolls).
7. **Inventory filtering** should be shared. Scrolls need a focused browser, but
   rings, wands, dipping targets, and future identification/curses should reuse
   the same filter state and target-picker conventions instead of building
   parallel item lists.

## Suggested sequencing

Rings Phase 1 (slot/equip plumbing) and the wands data model both exercise the
`InventoryRef`/`EquipSlot`/savegame extensions — doing one first establishes the
pattern the others follow. A shared **identification + curses** plan is the natural
next document, since it unlocks the final phase of all three.

## Map-generation expansion

- **[Map Generation Variety](map_generation_variety_plan.md)** — expands the
  classic 3x3 generator with rare large rooms, optional merged rooms, floor
  profiles, room archetypes, corridor/hall variety, and less predictable monster
  placement while preserving reachability, secret-door fairness, dark-room rules,
  trap safety, and floor-20 finale constraints.
