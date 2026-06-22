<script lang="ts">
  import { ui } from '../store.svelte';
  import SectionLabel from './primitives/SectionLabel.svelte';
  import EquipSlot from './EquipSlot.svelte';
</script>

<div class="equipment">
  <div class="header">
    <SectionLabel text="Equipment">
      {#snippet trailing()}
        <span class="count tnum">{ui.equipment.length} slots</span>
      {/snippet}
    </SectionLabel>
  </div>
  <div class="list">
    {#each ui.equipment as slot (slot.slot)}
      <EquipSlot {slot} />
    {/each}
  </div>
</div>

<style>
  .equipment {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .header {
    padding: 14px 12px 8px;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 0 8px 8px;
  }
</style>
