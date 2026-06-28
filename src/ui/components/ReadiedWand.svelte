<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';
  import SectionLabel from './primitives/SectionLabel.svelte';

  // Wands aren't gear slots, so this strip lives just below the equipment rail
  // and reads as a different kind of thing: it shows the wand a zap would draw
  // (engine.drawFirstWand order) and its recharge state. Clicking begins a zap.
  const wand = $derived(ui.readiedWand);

  function zap() {
    actions.drawFirstWand();
  }
</script>

{#if wand}
  <div class="readied">
    <div class="header">
      <SectionLabel text="Readied">
        {#snippet trailing()}
          {#if wand.extraCount > 0}
            <span class="extra tnum">+{wand.extraCount}</span>
          {/if}
        {/snippet}
      </SectionLabel>
    </div>
    <button
      class="wand"
      class:recharging={!wand.ready}
      onclick={zap}
      aria-label="Readied wand: {wand.name}; {wand.ready
        ? 'ready to zap'
        : `recharging, ${wand.cooldownRemaining} turns left`}{wand.extraCount > 0
        ? `; ${wand.extraCount} more carried`
        : ''}. Zap."
    >
      <span class="tile" style:color={wand.rarityColor}>
        <Icon name={wand.icon} size={18} />
      </span>
      <span class="text">
        <span class="name-line">
          <span class="name" style:color={wand.rarityColor}>{wand.name}</span>
          <span class="state tnum" class:ready={wand.ready}>
            {wand.ready ? 'Ready' : `${wand.cooldownRemaining}t`}
          </span>
        </span>
        {#if wand.ready}
          <span class="detail">{wand.detail}</span>
        {:else}
          <span class="recharge" role="img" aria-label="Recharged {wand.rechargePct}%">
            <span class="fill" style:width="{wand.rechargePct}%"></span>
          </span>
        {/if}
      </span>
    </button>
  </div>
{/if}

<style>
  .readied {
    display: flex;
    flex-direction: column;
    flex: none;
  }
  .header {
    padding: 6px 12px 4px;
  }
  .extra {
    font-variant-numeric: tabular-nums;
  }
  .wand {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    width: calc(100% - 16px);
    margin: 0 8px 8px;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: var(--surface-card);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }
  .wand:hover {
    background: var(--surface-inset-2);
  }
  .wand:focus-visible {
    outline: none;
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 35%, transparent);
  }
  .wand.recharging {
    opacity: 0.82;
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
    background: var(--surface-inset-2);
    border: 1px solid var(--border-slot);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
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
  .state {
    flex: none;
    margin-left: auto;
    font: 600 10px var(--font-display);
    color: var(--text-label);
    font-variant-numeric: tabular-nums;
  }
  .state.ready {
    color: var(--good);
  }
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 500 var(--fs-label) var(--font-ui);
    color: var(--text-faint);
  }
  .recharge {
    display: block;
    height: 4px;
    border-radius: var(--r-pill);
    background: var(--surface-inset);
    overflow: hidden;
  }
  .recharge .fill {
    display: block;
    height: 100%;
    border-radius: var(--r-pill);
    background: var(--accent);
    transition: width var(--dur-fast) var(--ease);
  }
</style>
