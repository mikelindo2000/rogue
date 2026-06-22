<script lang="ts">
  import type { InventoryCell } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';

  let { cell, onSelect }: { cell?: InventoryCell; onSelect?: (cell: InventoryCell) => void } = $props();
</script>

{#if cell}
  <button
    class="slot filled"
    aria-label={cell.label}
    style="--rarity:{cell.rarityColor}"
    onclick={() => onSelect?.(cell)}
  >
    <span class="icon" style="color:{cell.rarityColor}">
      <Icon name={cell.icon} size={20} />
    </span>
    {#if cell.count}
      <span class="count">{cell.count}</span>
    {/if}
  </button>
{:else}
  <div class="slot empty" aria-hidden="true"></div>
{/if}

<style>
  .slot {
    aspect-ratio: 1;
    border-radius: var(--r-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .filled {
    background: color-mix(in srgb, var(--rarity) 7%, var(--surface-card));
    border: 1px solid color-mix(in srgb, var(--rarity) 45%, var(--border-slot));
    box-shadow: inset 0 0 14px color-mix(in srgb, var(--rarity) 10%, transparent);
    cursor: pointer;
    padding: 0;
    transition: border-color var(--dur-fast) var(--ease);
  }
  .filled:hover {
    border-color: color-mix(in srgb, var(--rarity) 65%, var(--border-slot));
  }
  .empty {
    background: var(--surface-page);
    border: 1px dashed var(--border-dashed);
  }
  .icon {
    display: flex;
  }
  .count {
    position: absolute;
    right: 4px;
    bottom: 3px;
    font: 600 9.5px var(--font-display);
    font-variant-numeric: tabular-nums;
    color: var(--text-label);
  }
</style>
