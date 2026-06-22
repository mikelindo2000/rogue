<script lang="ts">
  let {
    value,
    max,
    segments = 10,
  }: { value: number; max: number; segments?: number } = $props();

  const filled = $derived(max > 0 ? Math.round((value / max) * segments) : 0);
  const low = $derived(max > 0 && value > 0 && value / max <= 0.3);
</script>

<div
  class="bar"
  role="progressbar"
  aria-valuenow={Math.max(0, value)}
  aria-valuemin={0}
  aria-valuemax={max}
  aria-label="Health"
>
  {#each Array.from({ length: segments }) as _, i}
    <span
      class="seg"
      class:fill={i < filled}
      class:last={low && i === filled - 1}
    ></span>
  {/each}
</div>

<style>
  .bar {
    display: flex;
    gap: 3px;
  }
  .seg {
    flex: 1;
    height: 11px;
    border-radius: 3px;
    background: var(--hp-empty);
    transition: background var(--dur) var(--ease);
  }
  .seg.fill {
    background: var(--hp);
  }
  .seg.last {
    background: var(--hp-low);
  }
</style>
