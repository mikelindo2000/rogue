<script lang="ts">
  import { ui } from '../store.svelte';
  import SectionLabel from './primitives/SectionLabel.svelte';
  import ItemSlot from './ItemSlot.svelte';

  const cells = $derived(
    Array.from({ length: ui.inventoryMax }, (_, i) => ui.inventory[i])
  );
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
      <ItemSlot {cell} />
    {/each}
  </div>
</section>

<style>
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
  }
</style>
