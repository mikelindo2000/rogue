<script lang="ts">
  let {
    pct,
    label,
    color = 'var(--good)',
    size = 56,
    warning = false,
    urgent = false,
  }: { pct: number; label: string; color?: string; size?: number; warning?: boolean; urgent?: boolean } = $props();

  const R = 20;
  const CIRC = 2 * Math.PI * R; // ≈ 125.66
  const clamped = $derived(Math.min(100, Math.max(0, pct)));
  const offset = $derived(CIRC * (1 - clamped / 100));
</script>

<div class="ring" class:warning class:urgent>
  <svg viewBox="0 0 48 48" width={size} height={size}>
    <circle cx="24" cy="24" r={R} fill="none" stroke="var(--surface-inset-2)" stroke-width="5" />
    <circle
      class="meter"
      cx="24"
      cy="24"
      r={R}
      fill="none"
      stroke={color}
      stroke-width="5"
      stroke-linecap="round"
      stroke-dasharray={CIRC}
      stroke-dashoffset={offset}
      transform="rotate(-90 24 24)"
      style="transition: stroke-dashoffset var(--dur-slow) var(--ease);"
    />
    <text x="24" y="27" text-anchor="middle" class="pct">{clamped}%</text>
  </svg>
  <span class="cap" style:color>{label}</span>
</div>

<style>
  .ring {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }
  .pct {
    fill: var(--text-bright);
    font: 600 11px var(--font-display);
  }
  .cap {
    font: 600 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }
  .ring.warning .meter {
    animation: hunger-survival-pulse 2.35s var(--ease) infinite;
    filter: drop-shadow(0 0 4px rgba(224, 162, 63, 0.22));
  }
  .ring.warning.urgent .meter {
    animation-duration: 1.55s;
    filter: drop-shadow(0 0 5px rgba(217, 84, 74, 0.26));
  }

  @keyframes hunger-survival-pulse {
    0%, 100% {
      stroke-width: 5;
      opacity: 0.86;
    }
    50% {
      stroke-width: 6.2;
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ring.warning .meter {
      animation: none;
      stroke-width: 6;
      opacity: 1;
    }
  }
</style>
