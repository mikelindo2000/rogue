<script lang="ts">
  let {
    value,
    max,
    segments = 10,
    warning = false,
  }: { value: number; max: number; segments?: number; warning?: boolean } = $props();

  const filled = $derived(max > 0 ? Math.round((value / max) * segments) : 0);
</script>

<div
  class="bar"
  class:warning
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
      class:last={filled > 0 && i === filled - 1}
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
    border-radius: var(--r-2xs);
    background: var(--hp-empty);
    transition: background var(--dur) var(--ease);
  }
  .seg.fill {
    background: var(--hp);
  }
  .seg.last {
    background: var(--hp-low);
  }
  .bar.warning .seg.fill {
    animation: hp-survival-pulse 1.7s var(--ease) infinite;
    box-shadow: 0 0 10px rgba(217, 84, 74, 0.12);
  }

  @keyframes hp-survival-pulse {
    0%, 100% {
      filter: saturate(1);
      box-shadow: 0 0 8px rgba(217, 84, 74, 0.1);
    }
    48% {
      filter: saturate(1.35) brightness(1.08);
      box-shadow: 0 0 14px rgba(217, 84, 74, 0.28);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar.warning .seg.fill {
      animation: none;
      filter: saturate(1.25);
      box-shadow: 0 0 10px rgba(217, 84, 74, 0.2);
    }
  }
</style>
