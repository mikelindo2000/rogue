<script lang="ts">
  let {
    pct,
    label,
    color = 'var(--good)',
    size = 56,
  }: { pct: number; label: string; color?: string; size?: number } = $props();

  const R = 20;
  const CIRC = 2 * Math.PI * R; // ≈ 125.66
  const clamped = $derived(Math.min(100, Math.max(0, pct)));
  const offset = $derived(CIRC * (1 - clamped / 100));
</script>

<div class="ring">
  <svg viewBox="0 0 48 48" width={size} height={size}>
    <circle cx="24" cy="24" r={R} fill="none" stroke="var(--surface-inset-2)" stroke-width="5" />
    <circle
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
</style>
