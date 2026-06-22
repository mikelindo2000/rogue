<script lang="ts">
  import { actions } from '../store.svelte';
  import type { EquipSlotView } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';
  import RarityDot from './primitives/RarityDot.svelte';
  import Popover, { type MenuItem } from './primitives/Popover.svelte';

  let { slot, onOpenChange }: { slot: EquipSlotView; onOpenChange?: (open: boolean) => void } =
    $props();

  const items = $derived<MenuItem[]>(
    slot.options.map((o) => ({
      value: o.value,
      label: o.label,
      color: o.rarityColor,
      selected: o.selected,
      disabled: o.disabled,
    }))
  );

  function onSelect(value: string) {
    actions.equip(slot.slot, value);
  }
</script>

<Popover
  {items}
  {onSelect}
  {onOpenChange}
  align="stretch"
  label="{slot.label} options"
>
  {#snippet trigger({ toggle, open })}
    <button
      class="slot"
      class:filled={!slot.empty}
      class:open
      onclick={toggle}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="{slot.label}: {slot.empty ? 'Empty' : slot.itemName}"
    >
      <span class="tile" class:filled={!slot.empty} style:color={slot.empty ? 'var(--text-faintest)' : slot.rarityColor}>
        <Icon name={slot.icon} size={18} />
      </span>
      <span class="text">
        <span class="label">{slot.label}</span>
        {#if slot.empty}
          <span class="name empty">Empty</span>
        {:else}
          <span class="name" style:color={slot.rarityColor}>{slot.itemName}</span>
        {/if}
      </span>
      {#if !slot.empty}
        <RarityDot color={slot.rarityColor} glow />
      {/if}
    </button>
  {/snippet}
</Popover>

<style>
  .slot {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: var(--r-md);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }
  .slot.filled {
    background: var(--surface-card);
  }
  .slot:hover,
  .slot.open {
    background: var(--surface-card);
  }
  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: var(--r-md);
    background: var(--surface-card);
    border: 1px dashed var(--border-slot);
  }
  .tile.filled {
    background: var(--surface-inset-2);
    border: 1px solid var(--border-slot);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .label {
    font: 600 var(--fs-slot-label) var(--font-display);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  .name {
    font: 600 var(--fs-body) var(--font-ui);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name.empty {
    font: 500 var(--fs-body) var(--font-ui);
    color: var(--text-faint);
  }
</style>
