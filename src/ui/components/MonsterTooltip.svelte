<script lang="ts">
  import { ui } from '../store.svelte';
  import MonsterMention from './MonsterMention.svelte';

  const m = $derived(ui.nearbyMonster);
  const pct = $derived(m ? Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100)) : 0);
  const mention = $derived(m ? {
    id: m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name: m.name,
    glyph: m.glyph,
    color: m.color,
    boss: false,
  } : null);
</script>

{#if m}
  <div class="tooltip" role="img" aria-label="{m.name}, {m.hp} of {m.maxHp} health">
    <div class="head">
      {#if mention}
        <span class="name"><MonsterMention {mention} /></span>
      {/if}
      {#if m.hostile}
        <span class="state">hostile</span>
      {/if}
      {#if m.subtitle}
        <span class="sub">{m.subtitle}</span>
      {/if}
    </div>
    <div class="hp">
      <div
        class="track"
        role="progressbar"
        aria-valuenow={m.hp}
        aria-valuemin={0}
        aria-valuemax={m.maxHp}
      >
        <div class="fill" style="width:{pct}%"></div>
      </div>
      <span class="val">{m.hp}/{m.maxHp}</span>
    </div>
  </div>
{/if}

<style>
  .tooltip {
    position: absolute;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 4;
    width: 196px;
    padding: 11px 12px;
    background: var(--surface-popover);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border-popover);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-pop);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    font: 600 13px var(--font-ui);
    color: var(--text-bright);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name :global(.monster-mention__glyph) {
    width: 26px;
    height: 26px;
    margin-inline-end: 8px;
    font: 700 14px / 1 var(--font-display);
    border-radius: var(--r-sm);
    vertical-align: -8px;
  }
  .state {
    font: 500 10.5px var(--font-ui);
    color: var(--danger);
  }
  .sub {
    margin-left: auto;
    font: 500 var(--fs-sm) var(--font-ui);
    color: var(--text-label);
  }
  .hp {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 9px;
  }
  .track {
    flex: 1;
    height: 5px;
    border-radius: var(--r-2xs);
    background: var(--surface-inset-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--danger);
    border-radius: var(--r-2xs);
    transition: width var(--dur) var(--ease);
  }
  .val {
    font: 600 10.5px var(--font-display);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
</style>
