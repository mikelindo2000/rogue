<script lang="ts">
  import { ui, actions, type InventoryCell } from '../store.svelte';
  import SectionLabel from './primitives/SectionLabel.svelte';
  import ItemSlot from './ItemSlot.svelte';

  const cells = $derived(
    Array.from({ length: ui.inventoryMax }, (_, i) => ui.inventory[i])
  );

  function openItem(cell: InventoryCell) {
    actions.selectInventoryItem(cell.ref);
    actions.setInventoryOpen(true);
  }
</script>

<section class="inventory">
  <header>
    <SectionLabel text="Inventory">
      {#snippet trailing()}
        <span class="meta">{ui.inventoryCount} / {ui.inventoryMax}</span>
      {/snippet}
    </SectionLabel>
  </header>
  <div class="grid">
    {#each cells as cell, i (i)}
      <ItemSlot {cell} onSelect={openItem} />
    {/each}
  </div>
</section>

<style>
  /* Flex column so the grid can scroll within whatever vertical space the rail
     gives it, instead of overflowing and crowding the message log on short
     viewports. Mirrors the scrollable pattern in Equipment.svelte. */
  .inventory {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  header {
    padding: 14px 14px 6px;
  }
  .meta {
    font: 600 10.5px var(--font-display);
    font-variant-numeric: tabular-nums;
    color: var(--text-dimmer);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 7px;
    padding: 6px 12px 14px;
    border-bottom: 1px solid var(--border-subtle);
    /* min-height:0 lets the grid shrink below its content height so overflow-y
       can take over and scroll the rows that don't fit. */
    min-height: 0;
    overflow-y: auto;
  }
</style>
