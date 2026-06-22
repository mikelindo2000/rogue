<script lang="ts">
  import { ui } from '../store.svelte';
  import type { HungerTone } from '../format';
  import SectionLabel from './primitives/SectionLabel.svelte';
  import SegmentedBar from './primitives/SegmentedBar.svelte';
  import ProgressBar from './primitives/ProgressBar.svelte';
  import ProgressRing from './primitives/ProgressRing.svelte';

  const HUNGER_COLOR: Record<HungerTone, string> = {
    ok: 'var(--good)',
    warn: 'var(--accent-strong)',
    low: 'var(--hp-low)',
    crit: 'var(--danger)',
  };

  const hungerColor = $derived(HUNGER_COLOR[ui.hungerTone]);
</script>

<div class="vitals">
  <div class="block">
    <SectionLabel text="Health">
      {#snippet trailing()}
        <span class="hp-value tnum"
          ><span class="cur">{ui.hp}</span><span class="max"> / {ui.maxHp}</span></span
        >
      {/snippet}
    </SectionLabel>
    <SegmentedBar value={ui.hp} max={ui.maxHp} />
  </div>

  <div class="row">
    <div class="xp">
      <SectionLabel text="Experience">
        {#snippet trailing()}
          <span class="xp-level">Lv {ui.level}</span>
        {/snippet}
      </SectionLabel>
      <ProgressBar value={ui.xp} max={ui.xpReq} />
      <div class="xp-caption tnum">
        {#if ui.atMaxLevel}MAX LEVEL{:else}{ui.xp} / {ui.xpReq}{/if}
      </div>
    </div>
    <ProgressRing pct={ui.hungerPct} label={ui.hungerStatus} color={hungerColor} />
  </div>
</div>

<style>
  .vitals {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .hp-value {
    font: 600 12.5px var(--font-display);
    font-variant-numeric: tabular-nums;
  }
  .hp-value .cur {
    color: var(--hp);
  }
  .hp-value .max {
    color: var(--text-dimmer);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }
  .xp {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .xp-level {
    font: 600 11px var(--font-display);
    color: var(--xp-label);
  }
  .xp-caption {
    font: 500 var(--fs-xs) var(--font-display);
    color: var(--text-dimmer);
    font-variant-numeric: tabular-nums;
  }
</style>
