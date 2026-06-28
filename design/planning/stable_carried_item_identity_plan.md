# Stable Carried Item Identity Plan

Date: 2026-06-28
Status: planning only

## Why This Exists

The current inventory model is intentionally simple: weapons, armor, shields,
and wands live in ordered arrays, and UI actions send `InventoryRef` objects
that point at array indices. That is workable today, but the next inventory
expansions (accessory slots, curses, identification, coatings, targeting, and
more pickers) need stable carried-item identity so a selected item stays the
same item even when nearby arrays reorder.

This is not an implementation task. It documents the migration needed before
several more systems build on index-sensitive references.

## Current Index-Based References

- `src/types.ts`
  - `InventoryRef` uses `index` for weapons, armor, shields, and wands.
  - `EquipTarget` uses numeric indices for main-hand and armor slots.
  - `Equipped.mainHand` and every armor slot store numeric indices.
  - `Equipped.offHand` stores typed strings such as `weapon:2`,
    `shield:1`, and `none:0`.
- `src/player.ts`
  - `inventoryRefToEquipTarget`, `canEquip`, `equipValidated`,
    `normalizeOffHand`, `getTotalDef`, and attack lookup all resolve equipped
    items through array positions.
- `src/engine.ts`
  - Wand aiming/zapping stores `InventoryRef & { kind: 'wand' }`.
  - Combat reads `equipped.mainHand` and `equipped.offHand`.
  - Scroll repair/enchant helpers prefer equipped array positions.
  - `removeAndBuildFloorItem` splices arrays for drop actions.
  - `adjustWeaponIndices`, `adjustArmorIndices`, and `adjustShieldIndices`
    repair equipped references after splices.
- `src/presentation/chrome/inventoryProjection.ts`,
  `src/ui/equipmentView.ts`, and `src/ui/inventoryStats.ts`
  - Build inventory/equipment views by enumerating arrays and encoding index
    refs back into UI actions.
- `src/ui/components/InventoryModal.svelte`
  - Builds keyboard/pointer selection keys from `InventoryRef` index fields.
- `src/persistence/savegame.ts`
  - Save version 5 persists the current index-based `Player` shape directly and
    validates only array presence and item type basics before normalization.

## Target Shape

Add stable ids only to individually carried, non-stackable items:

```ts
export type ItemId = string;

export type IdentifiedGearItem = GearItem & { id: ItemId };
export type IdentifiedWandItem = WandItem & { id: ItemId };

export type InventoryRef =
  | { kind: 'food' }
  | { kind: 'potion'; potionType: PotionType }
  | { kind: 'scroll'; scrollType: ScrollType }
  | { kind: 'weapon'; id: ItemId }
  | { kind: 'wand'; id: ItemId }
  | { kind: 'armor'; slot: ArmorSlot; id: ItemId }
  | { kind: 'shield'; id: ItemId };

export type Equipped =
  | {
      mainHand: ItemId | null;
      offHand: { kind: 'none' } | { kind: 'weapon'; id: ItemId } | { kind: 'shield'; id: ItemId };
    } & Record<ArmorSlot, ItemId | null>;
```

Keep array order for display and deterministic save output. Consumables can
remain type/count stacks until a future system needs individual potion or scroll
identity.

## Save-Versioned Migration

Use the next save version bump for this migration.

1. Add `id?: string` to gear and wand validation as an accepted transitional
   field.
2. During load of older save versions, clone the player and assign ids to every
   carried weapon, armor, shield, and wand that lacks one.
3. Convert equipped numeric indices to ids after ids have been assigned:
   - `mainHand = inventory.weapons[old.mainHand]?.id ?? null`
   - armor slot = `inventory[slot][oldIndex]?.id ?? null`
   - `offHand = { kind: 'none' }`, `{ kind: 'weapon', id }`, or
     `{ kind: 'shield', id }` parsed from the old typed string.
4. Preserve sentinel "None" rows only for compatibility during the same
   migration, then decide whether to remove them or keep them as display
   placeholders. Equipped empty slots should be `null` / `{ kind: 'none' }`.
5. Save only the new id-based shape after restore/autosave.
6. Reject malformed new-version saves where equipped ids do not resolve to an
   item in the appropriate carried array.

ID generation should be deterministic within a restore operation and collision
checked against the whole carried inventory. A simple prefix plus counter is
enough for migrated saves (`gear-w-0`, `gear-helm-1`, `wand-0`); newly spawned
items can use an engine-local item id allocator if later systems require ids
before pickup.

## Implementation Order

1. Add id helpers and tests that assign missing ids without changing array
   order.
2. Add lookup helpers:
   - find carried item by id and kind,
   - resolve equipped main/off-hand/armor,
   - encode/decode old off-hand strings only inside migration code.
3. Convert `Equipped` and `InventoryRef` types to ids.
4. Update `player.ts` equip/can-equip helpers.
5. Update engine actions: equip, zap, drop, enchant/repair target selection,
   combat weapon lookup, and index-adjust deletion.
6. Update chrome projection, equipment comparisons, and inventory modal
   selection keys to use ids.
7. Add save migration/validation tests, including corrupt ids and old V5 saves.
8. Remove `adjustWeaponIndices`, `adjustArmorIndices`, and
   `adjustShieldIndices` once no equipped references shift on array splice.

## Future Dependencies

Make these future tasks depend on this migration or explicitly accept the
temporary index cost:

- accessory equipment slots (rings, necklaces, belts, wrists, trinkets),
- ring identification and curses,
- item coatings/dipping,
- targeted item effects that hold a selected item across modal transitions,
- any picker that allows sorting/filtering carried gear independently of storage
  order.

## Non-Goals

- Do not give stackable food, potions, or scrolls individual ids in the first
  migration.
- Do not change floor item identity unless a future pickup/drop animation or
  persistence task needs floor-stable ids.
- Do not redesign inventory UI layout as part of the identity migration.
