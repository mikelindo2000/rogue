<script lang="ts">
  import type { InventoryCell } from '../store.svelte';

  let { cell, id }: { cell: InventoryCell; id: string } = $props();
</script>

<div class="tooltip" role="tooltip" {id}>
  <div class="title" style:color={cell.rarityColor}>{cell.label}</div>
  <div class="detail">{cell.detail}</div>
  {#if cell.tooltipStats?.length}
    <div class="stats">
      {#each cell.tooltipStats as stat (`${stat.label}:${stat.value}`)}
        <div class="row" class:better={stat.tone === 'better'} class:worse={stat.tone === 'worse'}>
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tooltip {
    position: absolute;
    top: 0;
    right: calc(100% + 8px);
    z-index: 90;
    width: 190px;
    padding: 10px;
    border: 1px solid var(--border-popover);
    border-radius: var(--r-xl);
    background: var(--surface-popover);
    box-shadow: var(--shadow-pop);
    backdrop-filter: blur(10px);
    pointer-events: none;
    animation: tooltip-in var(--dur-fast) var(--ease);
  }

  .title {
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 750 var(--fs-body) var(--font-display);
  }

  .detail {
    color: var(--text-muted);
    font: 500 var(--fs-xs)/1.35 var(--font-ui);
  }

  .stats {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-subtle);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--text-dim);
    font: 600 var(--fs-xs) var(--font-display);
  }

  .row strong {
    color: var(--text);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .row.better strong {
    color: var(--good-bright);
  }

  .row.worse strong {
    color: var(--danger-soft);
  }

  @keyframes tooltip-in {
    from {
      opacity: 0;
      transform: translateX(4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }
</style>
