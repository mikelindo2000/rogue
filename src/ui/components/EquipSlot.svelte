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
      meta: o.meta,
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
      aria-label="{slot.label}: {slot.empty ? (slot.emptyLabel ?? 'Empty') : slot.itemName}; {slot.statLabel}; {slot.availableLabel}"
    >
      <span class="tile" class:filled={!slot.empty} style:color={slot.empty ? 'var(--text-faintest)' : slot.rarityColor}>
        <Icon name={slot.icon} size={18} />
      </span>
      <span class="text">
        <span class="label">{slot.label}</span>
        <span class="name-line">
          {#if slot.empty}
            <span class="name empty">{slot.emptyLabel ?? 'Empty'}</span>
          {:else}
            <span class="name" style:color={slot.rarityColor}>{slot.itemName}</span>
          {/if}
          <span class="stat tnum">{slot.statLabel}</span>
        </span>
      </span>
      <span class="right">
        {#if slot.availableCount > 0}
          <span
            class="available tnum"
            class:upgrade={slot.hasUpgrade || slot.empty}
            title={slot.hasUpgrade ? `${slot.availableLabel}; upgrade available` : slot.availableLabel}
          >
            {slot.availableCount}
          </span>
        {/if}
        {#if !slot.empty}
          <RarityDot color={slot.rarityColor} glow />
        {/if}
      </span>
    </button>
  {/snippet}
</Popover>

<style>
  .slot {
    display: flex;
    align-items: center;
    gap: 9px;
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
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  .name-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .name {
    flex: 0 1 auto;
    min-width: 0;
    font: 600 var(--fs-body) var(--font-ui);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name.empty {
    font: 500 var(--fs-body) var(--font-ui);
    color: var(--text-faint);
  }
  .stat {
    flex: none;
    font: 600 10px var(--font-display);
    color: var(--text-label);
    font-variant-numeric: tabular-nums;
  }
  .right {
    flex: none;
    width: 44px;
    min-height: 20px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
  }
  .available {
    min-width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
    border-radius: var(--r-pill);
    border: 1px solid var(--border-chip);
    background: var(--surface-inset);
    color: var(--text-muted);
    font: 700 10px var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .available.upgrade {
    color: var(--accent);
    border-color: var(--accent-border);
    background: var(--accent-surface);
    box-shadow: 0 0 10px color-mix(in srgb, var(--accent-glow) 28%, transparent);
  }
</style>
