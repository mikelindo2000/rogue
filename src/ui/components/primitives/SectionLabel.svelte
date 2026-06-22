<script lang="ts">
  import type { Snippet } from 'svelte';

  let { text, trailing }: { text: string; trailing?: Snippet } = $props();
</script>

<div class="row">
  <span class="label">{text}</span>
  {#if trailing}<span class="trailing">{@render trailing()}</span>{/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .label {
    font: 600 var(--fs-label) / 1 var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  .trailing {
    font: 600 var(--fs-label) / 1 var(--font-display);
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
</style>
