# Inventory System Plan

## Current failures

- The footer and design spec advertise `i` as an inventory shortcut, but `src/main.ts`
  does not register an `i` binding and there is no inventory modal state/action in
  `src/ui/store.svelte.ts`.
- `src/ui/components/Inventory.svelte` and `ItemSlot.svelte` render inventory as a
  passive grid. Cells have labels, icons, and counts, but no stable item id, item
  kind, or command surface.
- Equipment choices are generated from array indexes in `GameUI.buildEquipment`.
  Those indexes work for the moment they are rendered, but the UI cannot ask "equip
  this inventory item" because inventory cells do not carry a reference back to the
  underlying player inventory entry.
- `handleEquipItem` trusts the incoming slot/value pair. It accepts incompatible or
  stale values, and only normalizes the two-handed main-hand/off-hand conflict after
  mutating equipped state.
- Pickup happens automatically in `GameEngine.checkItems`, while the footer also
  advertises `g` pick up. This plan keeps auto-pickup unless we decide to change the
  broader interaction model, but it should make inventory behavior match the UI hints
  we keep.

## Target behavior

- Pressing `i` opens a real inventory overlay. Pressing `i` again or `Escape` closes it.
- The right-rail inventory remains a compact glanceable grid, but clicking a filled
  cell opens the same item detail/actions flow as the overlay.
- Every carried item has a stable UI identity for the current run:
  - food stack
  - potion stack or individual potion entry
  - weapon entry
  - armor entry
  - shield entry
- Gear can be equipped from both places:
  - equipment slot popovers
  - inventory item actions
- Consumables can be used from inventory:
  - food: eat one ration
  - potion: drink one potion of the selected type
- The system refuses invalid actions with a log message instead of silently doing
  nothing or entering an impossible equipment state.
- Equipment restrictions are explicit:
  - two-handed weapons and staves clear and disable off-hand
  - off-hand dagger requires a dagger in main hand
  - the same weapon cannot be equipped in both hands
  - shields can only occupy off-hand
  - armor can only occupy its matching armor slot

## Data model changes

1. Add stable inventory references for UI actions.

   Proposed union in `src/types.ts`:

   ```ts
   export type InventoryRef =
     | { kind: 'food' }
     | { kind: 'potion'; potionType: PotionType }
     | { kind: 'weapon'; index: number }
     | { kind: 'armor'; slot: ArmorSlot; index: number }
     | { kind: 'shield'; index: number };
   ```

   This keeps the existing player inventory arrays intact and avoids a risky save
   model rewrite.

2. Expand `InventoryCell` in `src/ui/store.svelte.ts`.

   Add fields such as:

   ```ts
   ref: InventoryRef;
   equipped?: boolean;
   detail: string;
   actions: InventoryActionView[];
   ```

   `InventoryActionView` should expose label, command id, disabled state, and an
   optional reason. The UI should not infer business rules from item labels.

3. Add inventory overlay state/actions.

   Extend `UIState` and `UIActions` with:

   ```ts
   inventoryOpen: boolean;
   selectedInventoryRef: InventoryRef | null;
   setInventoryOpen(open: boolean): void;
   selectInventoryItem(ref: InventoryRef | null): void;
   inventoryAction(ref: InventoryRef, action: InventoryAction): void;
   ```

## Engine command layer

Add command methods to `GameEngine` instead of letting components call equipment
indexes directly:

- `equipInventoryItem(ref: InventoryRef): boolean`
- `useInventoryItem(ref: InventoryRef): boolean`
- `dropInventoryItem(ref: InventoryRef): boolean` can be deferred, but leave the
  action model ready for it.
- `equipGear(slot: EquipSlot, value: string)` should remain for existing equipment
  popovers, but should route through a validating helper.

Move equipment validation out of UI code and into `src/player.ts`:

- `canEquip(player, target): EquipValidation`
- `equipValidated(player, target, addLog): boolean`
- `inventoryRefToEquipTarget(player, ref): EquipTarget | null`

This makes the left equipment popovers and inventory overlay share the same rules.

Validation should happen before mutation. If a selection is invalid because the
inventory has changed, return `false`, add a short log line, and rebuild UI state.

## UI plan

1. Create `InventoryModal.svelte`.

   Use the existing `Modal.svelte` primitive. The modal should show:

   - a compact list/grid of carried items
   - selected item name, rarity, stats, and equipped state
   - action buttons appropriate for that item
   - empty-state copy only when no carried items exist beyond equipped starter gear

2. Upgrade `Inventory.svelte` and `ItemSlot.svelte`.

   - Pass `cell.ref` into `actions.selectInventoryItem`.
   - Open the inventory modal on click.
   - Keep the current 5-column visual grid.
   - Add an equipped marker only if we decide the right rail should show equipped
     items; otherwise keep it strictly "backpack" and show equipped state in the modal.

3. Wire keyboard in `src/main.ts`.

   - Register `i` to toggle `ui.inventoryOpen`.
   - Let `Escape` be handled by the modal once open.
   - Reconcile the footer hint for `g`: either implement manual pickup or remove the
     hint. If we keep auto-pickup, remove `g` from the footer/spec in this work.

4. Keep equipment popovers, but rebuild their options from validated equipment
   targets.

   Disabled options should include a reason where useful, such as "requires dagger
   main hand" or "blocked by two-handed weapon".

## Implementation sequence

1. Add inventory refs and command types.
2. Add shared equipment validation helpers in `src/player.ts`.
3. Update `GameEngine` to expose validated inventory commands and to use validation
   for current equipment dropdown changes.
4. Expand `InventoryCell`/store state/actions.
5. Build the inventory modal and wire the `i` shortcut.
6. Make right-rail item cells open the modal with the clicked item selected.
7. Update footer/spec hints for the final shortcut set.
8. Add tests for validation, engine commands, and keyboard/store behavior.

## Test plan

Unit tests:

- equipping weapon/armor/shield by inventory ref updates the right equipped slot
- two-handed weapon clears off-hand and blocks off-hand options
- dagger off-hand is only valid with dagger main-hand
- same weapon cannot be equipped in both hands
- stale or out-of-range refs fail safely and log a message
- potion and food actions consume exactly one item and process a turn
- inventory cell generation preserves refs for every displayed item

UI/check tests:

- `npm run check`
- Browser smoke:
  - pick up gear
  - press `i`
  - equip the gear from the modal
  - switch gear from the left equipment popover
  - drink a potion from inventory
  - verify modal closes with `Escape`

## Acceptance criteria

- Pressing `i` always opens inventory when no other modal/menu is active.
- Clicking a backpack item shows details and valid actions.
- Any gear picked up can be equipped from inventory if it is legal for its slot.
- Equipment dropdowns and inventory actions produce the same final equipped state.
- Invalid selections are visibly rejected through the message log.
- The inventory count, grid, equipment panel, stats, and message log stay in sync
  after every inventory action.
