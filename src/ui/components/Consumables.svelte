<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';
  import Popover, { type MenuItem } from './primitives/Popover.svelte';

  const items = $derived<MenuItem[]>(
    ui.potions.map((p) => ({
      value: String(p.idx),
      label: p.label,
      icon: p.icon,
      iconColor: p.color,
      color: p.color,
    }))
  );
  const noPotions = $derived(ui.potions.length === 0);
  const firstPotion = $derived(ui.potions[0]);
  let potionButton = $state<HTMLButtonElement | null>(null);

  function onSelect(value: string) {
    actions.usePotion(Number(value));
  }

  function restoreAfterPotionMenu() {
    return potionButton && !potionButton.disabled ? potionButton : null;
  }
</script>

<div class="consumables">
  <Popover bind:open={ui.potionMenuOpen} {items} {onSelect} restoreFallback={restoreAfterPotionMenu} align="stretch" label="Potions">
    {#snippet trigger({ toggle, open })}
      <button
        bind:this={potionButton}
        class="btn potion"
        class:open
        onclick={toggle}
        disabled={noPotions}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Use potion"
      >
        <span class="icon" style:color={firstPotion?.color ?? 'var(--info)'}>
          <Icon name={firstPotion?.icon ?? 'potion-healing'} size={16} />
        </span>
        <span class="text">Use potion</span>
        <span class="count tnum">{ui.potions.length}</span>
      </button>
    {/snippet}
  </Popover>

  <button class="btn eat" onclick={() => actions.eat()} disabled={ui.food === 0} aria-label="Eat">
    <span class="icon"><Icon name="leaf" size={16} /></span>
    <span class="text">Eat</span>
    <span class="count tnum">{ui.food}/{ui.foodMax}</span>
  </button>
</div>

<style>
  .consumables {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid var(--border-subtle);
  }
  /* The potion Popover wrapper must flex like its sibling button. */
  .consumables :global(.pop) {
    flex: 1;
  }
  .btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 38px;
    padding: 0 11px;
    border-radius: var(--r-lg);
    cursor: pointer;
    font: 600 12px var(--font-ui);
    transition: background var(--dur-fast) var(--ease);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .icon {
    display: inline-flex;
    flex: none;
  }
  .text {
    flex: 1;
    text-align: left;
  }
  .potion {
    background: var(--surface-inset);
    border: 1px solid var(--border-slot);
    color: var(--text);
  }
  .potion:not(:disabled):hover,
  .potion.open {
    background: var(--surface-card);
  }
  .potion .count {
    color: var(--text-dimmer);
    font-variant-numeric: tabular-nums;
  }
  .eat {
    background: var(--accent-surface);
    border: 1px solid var(--accent-border);
    color: var(--accent);
  }
  .eat .count {
    color: var(--accent-deep);
    font-variant-numeric: tabular-nums;
  }
</style>
