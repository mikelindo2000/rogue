<script lang="ts">
  import { ui } from '../store.svelte';
  import SectionLabel from './primitives/SectionLabel.svelte';
  import EquipSlot from './EquipSlot.svelte';

  let listEl = $state<HTMLElement | null>(null);

  // Roving arrow navigation: Up/Down move focus between slot buttons so the rail
  // is fully reachable from the keyboard, not just by mouse.
  function buttons(): HTMLButtonElement[] {
    return listEl ? Array.from(listEl.querySelectorAll<HTMLButtonElement>('[data-equip-slot]')) : [];
  }

  function onKeydown(event: KeyboardEvent) {
    const items = buttons();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
    else if (event.key === 'ArrowUp') next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  }
</script>

<div class="equipment">
  <div class="header">
    <SectionLabel text="Equipment">
      {#snippet trailing()}
        <span class="count tnum">{ui.equipment.length} slots</span>
      {/snippet}
    </SectionLabel>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="list" bind:this={listEl} role="list" onkeydown={onKeydown}>
    {#each ui.equipment as slot, i (slot.slot)}
      <EquipSlot {slot} index={i} />
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
