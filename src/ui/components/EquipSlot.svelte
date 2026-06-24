<script lang="ts">
  import { actions } from '../store.svelte';
  import type { EquipSlotView } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';
  import RarityDot from './primitives/RarityDot.svelte';
  import DurabilityBar from './primitives/DurabilityBar.svelte';

  let { slot, index = 0 }: { slot: EquipSlotView; index?: number } = $props();

  // The slot is now a pure summary affordance: clicking (or Enter/Space) opens
  // the loadout hub focused on this slot, where selection actually happens.
  function open() {
    actions.selectEquipSlot(slot.slot);
    actions.setInventoryOpen(true);
  }

  const upgradeText = $derived(
    slot.upgrade ? `▲ ${slot.upgrade.bestName} · ${slot.upgrade.bestStat}` : ''
  );
</script>

<button
  class="slot"
  class:filled={!slot.empty}
  data-equip-slot={index}
  onclick={open}
  aria-label="{slot.label}: {slot.empty ? (slot.emptyLabel ?? 'Empty') : slot.itemName}; {slot.statLabel}{slot.health ? `; condition ${slot.health.tone}, ${slot.health.label}` : ''}{slot.upgrade ? `; better available: ${slot.upgrade.bestName} ${slot.upgrade.bestStat}` : ''}. Open loadout."
>
  <span
    class="tile"
    class:filled={!slot.empty}
    class:broken={slot.health?.tone === 'broken'}
    style:color={slot.empty ? 'var(--text-faintest)' : (slot.health?.color ?? slot.rarityColor)}
  >
    <Icon name={slot.icon} size={18} />
  </span>
  <span class="text">
    <span class="label-line">
      <span class="label">{slot.label}</span>
      {#if !slot.empty}<RarityDot color={slot.rarityColor} glow />{/if}
    </span>
    <span class="name-line">
      {#if slot.empty}
        <span class="name empty">{slot.emptyLabel ?? 'Empty'}</span>
      {:else}
        <span class="name" style:color={slot.rarityColor}>{slot.itemName}</span>
      {/if}
      <span class="stat tnum">{slot.statLabel}</span>
    </span>
    {#if slot.health}
      <DurabilityBar health={slot.health} />
    {/if}
    {#if slot.upgrade}
      <span class="upgrade" class:strict={slot.upgrade.strict}>{upgradeText}</span>
    {/if}
  </span>
</button>

<style>
  .slot {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    width: 100%;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }
  .slot.filled {
    background: var(--surface-card);
  }
  .slot:hover {
    background: var(--surface-card);
  }
  .slot:focus-visible {
    outline: none;
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 35%, transparent);
  }
  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex: none;
    margin-top: 2px;
    border-radius: var(--r-md);
    background: var(--surface-card);
    border: 1px dashed var(--border-slot);
  }
  .tile.filled {
    background: var(--surface-inset-2);
    border: 1px solid var(--border-slot);
  }
  .tile.broken {
    opacity: 0.72;
    filter: saturate(0.55);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .label-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
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
    margin-left: auto;
    font: 600 10px var(--font-display);
    color: var(--text-label);
    font-variant-numeric: tabular-nums;
  }
  .upgrade {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 9.5px var(--font-display);
    color: var(--good);
  }
  .upgrade.strict {
    color: var(--good-bright);
  }
</style>
