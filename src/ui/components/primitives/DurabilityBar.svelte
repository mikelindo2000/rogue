<script lang="ts">
  import type { GearHealthView } from '../../store.svelte';

  // Always-on condition readout: a thin segmented bar that makes wear glanceable
  // without opening anything. One pip per durability point up to PIP_CAP; beyond
  // that it falls back to a single continuous fill so the bar never gets noisy.
  let { health, width = '100%' }: { health: GearHealthView; width?: string } = $props();

  const PIP_CAP = 8;
  const segmented = $derived(health.max > 0 && health.max <= PIP_CAP);
  const pips = $derived(segmented ? Array.from({ length: health.max }, (_, i) => i < health.current) : []);
</script>

<span
  class="bar tone-{health.tone}"
  class:segmented
  style:width
  role="img"
  aria-label="Condition {health.tone}, {health.label}"
  title="Condition: {health.label} ({health.tone})"
>
  {#if segmented}
    {#each pips as filled, i (i)}
      <span class="pip" class:filled></span>
    {/each}
  {:else}
    <span class="fill" style:width="{Math.round(health.ratio * 100)}%"></span>
  {/if}
</span>

<style>
  .bar {
    --dura: var(--good);
    display: flex;
    align-items: stretch;
    gap: 2px;
    height: 4px;
    border-radius: var(--r-pill);
  }
  .bar.segmented {
    background: none;
  }
  .bar:not(.segmented) {
    background: var(--surface-inset);
    overflow: hidden;
  }
  .tone-good {
    --dura: var(--good);
  }
  .tone-worn {
    --dura: var(--accent);
  }
  .tone-bad {
    --dura: var(--danger);
  }
  .tone-broken {
    --dura: var(--text-faint);
  }
  .pip {
    flex: 1;
    min-width: 2px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--dura) 22%, var(--surface-inset));
  }
  .pip.filled {
    background: var(--dura);
  }
  .fill {
    height: 100%;
    border-radius: var(--r-pill);
    background: var(--dura);
  }
</style>
