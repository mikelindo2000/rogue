<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { InventoryCell } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';
  import InventoryTooltip from './InventoryTooltip.svelte';

  let { cell, onSelect }: { cell?: InventoryCell; onSelect?: (cell: InventoryCell) => void } = $props();

  let showTooltip = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tooltipId = $derived(cell ? `inventory-tooltip-${refKey(cell)}` : undefined);

  function refKey(cell: InventoryCell): string {
    const ref = cell.ref;
    if (ref.kind === 'food') return 'food';
    if (ref.kind === 'potion') return `potion-${ref.potionType}`;
    if (ref.kind === 'scroll') return `scroll-${ref.scrollType}`;
    if (ref.kind === 'weapon') return `weapon-${ref.index}`;
    if (ref.kind === 'wand') return `wand-${ref.index}`;
    if (ref.kind === 'shield') return `shield-${ref.index}`;
    return `armor-${ref.slot}-${ref.index}`;
  }

  function hasTooltip() {
    return !!cell?.tooltipStats?.length;
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function showDelayed() {
    if (!hasTooltip()) return;
    clearTimer();
    timer = setTimeout(() => {
      showTooltip = true;
      timer = null;
    }, 500);
  }

  function hideTooltip() {
    clearTimer();
    showTooltip = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') hideTooltip();
  }

  onDestroy(clearTimer);
</script>

{#if cell}
  <div class="slot-wrap">
    <button
      class="slot filled"
      aria-label={cell.statLabel ? `${cell.label}, ${cell.statLabel}${cell.health ? `, condition ${cell.health.tone}, ${cell.health.label}` : ''}` : cell.label}
      aria-describedby={showTooltip && tooltipId ? tooltipId : undefined}
      style="--rarity:{cell.health?.color ?? cell.rarityColor}"
      onclick={() => onSelect?.(cell)}
      onpointerenter={showDelayed}
      onpointerleave={hideTooltip}
      onfocus={showDelayed}
      onblur={hideTooltip}
      onkeydown={onKeydown}
    >
      <span class="icon" class:broken={cell.health?.tone === 'broken'} style="color:{cell.health?.color ?? cell.rarityColor}">
        <Icon name={cell.icon} size={20} />
      </span>
      {#if cell.health && cell.health.tone !== 'good'}
        <span class="health tnum" class:bad={cell.health.tone === 'bad'} class:broken={cell.health.tone === 'broken'}>{cell.health.label}</span>
      {/if}
      {#if cell.statLabel}
        <span class="stat tnum">{cell.statLabel}</span>
      {/if}
      {#if cell.count}
        <span class="count">{cell.count}</span>
      {/if}
    </button>
    {#if showTooltip && tooltipId}
      <InventoryTooltip {cell} id={tooltipId} />
    {/if}
  </div>
{:else}
  <div class="slot empty" aria-hidden="true"></div>
{/if}

<style>
  .slot-wrap {
    position: relative;
    aspect-ratio: 1;
  }

  .slot {
    aspect-ratio: 1;
    width: 100%;
    height: 100%;
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
  .filled:hover,
  .filled:focus-visible {
    border-color: color-mix(in srgb, var(--rarity) 65%, var(--border-slot));
    outline: none;
    box-shadow:
      0 0 0 2px var(--surface-page),
      0 0 0 4px var(--focus-ring),
      inset 0 0 14px color-mix(in srgb, var(--rarity) 10%, transparent);
  }
  .empty {
    aspect-ratio: 1;
    background: var(--surface-page);
    border: 1px dashed var(--border-dashed);
  }
  .icon {
    display: flex;
  }
  .icon.broken {
    opacity: 0.7;
    filter: saturate(0.55);
  }
  .health {
    position: absolute;
    top: 3px;
    right: 3px;
    max-width: calc(100% - 6px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px 4px;
    border-radius: var(--r-pill);
    border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--border-chip));
    background: var(--accent-surface);
    color: var(--accent);
    font: 750 8px var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .health.bad {
    border-color: color-mix(in srgb, var(--danger) 54%, var(--border-chip));
    background: color-mix(in srgb, var(--danger) 12%, var(--surface-inset));
    color: var(--danger);
  }
  .health.broken {
    border-color: var(--border-chip);
    background: var(--surface-inset);
    color: var(--text-faint);
  }
  .stat {
    position: absolute;
    left: 4px;
    bottom: 3px;
    max-width: calc(100% - 8px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 750 8.5px var(--font-display);
    font-variant-numeric: tabular-nums;
    color: var(--text-label);
    text-shadow: 0 1px 2px var(--surface-page);
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
