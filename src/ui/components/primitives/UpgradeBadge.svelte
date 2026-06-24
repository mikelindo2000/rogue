<script lang="ts">
  import type { GearVerdict } from '../../gearCompare';

  // Glanceable "is this better?" marker, arrows only (no words):
  //   ▲▲ green = strictly better (dominates equipped on every axis)
  //   ▲  green = upgrade (higher primary stat)
  //   ▼  red   = downgrade
  //   ★  gold  = the single best option for the slot
  // Renders nothing for a sidegrade or the equipped item itself.
  let {
    verdict,
    strictlyBetter = false,
    isBest = false,
    compact = false,
  }: {
    verdict?: GearVerdict;
    strictlyBetter?: boolean;
    isBest?: boolean;
    compact?: boolean;
  } = $props();

  const show = $derived(isBest || strictlyBetter || verdict === 'upgrade' || verdict === 'downgrade');
</script>

{#if show}
  <span class="badges" class:compact>
    {#if isBest}
      <span class="g best" title="Best option for this slot" aria-label="Best">★</span>
    {/if}
    {#if strictlyBetter}
      <span class="g up" title="Strictly better than equipped" aria-label="Strictly better">▲▲</span>
    {:else if verdict === 'upgrade'}
      <span class="g up" title="Upgrade over equipped" aria-label="Upgrade">▲</span>
    {:else if verdict === 'downgrade'}
      <span class="g down" title="Downgrade from equipped" aria-label="Downgrade">▼</span>
    {/if}
  </span>
{/if}

<style>
  .badges {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .g {
    line-height: 1;
    font: 800 12px var(--font-display);
    letter-spacing: -2px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  }
  .compact .g {
    font-size: 11px;
  }
  .best {
    color: var(--accent-strong);
    letter-spacing: 0;
  }
  .up {
    color: var(--good-bright);
  }
  .down {
    color: var(--danger-soft);
  }
</style>
