<script lang="ts">
  let {
    value,
    max,
    height = 5,
  }: { value: number; max: number; height?: number } = $props();

  const pct = $derived(max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0);
</script>

<div
  class="track"
  style:height="{height}px"
  role="progressbar"
  aria-valuenow={value}
  aria-valuemin={0}
  aria-valuemax={max}
  aria-label="Experience"
>
  <div class="fill" style:width="{pct}%"></div>
</div>

<style>
  .track {
    background: var(--surface-inset-2);
    border-radius: var(--r-2xs);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: var(--r-2xs);
    background: linear-gradient(90deg, var(--xp-from), var(--xp-to));
    transition: width var(--dur-slow) var(--ease);
  }
</style>
