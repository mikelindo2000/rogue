<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import type { BossEncounterView } from '../../boss';

  let { boss }: { boss: BossEncounterView } = $props();

  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const dur = reduce ? 0 : 320;

  // Width of the remaining-HP fill, in %.
  const fillPct = $derived(Math.round(boss.hpPct * 100));
  // Phase label shown beside the name (II / III read as escalation).
  const phaseLabel = $derived(boss.phase === 1 ? '' : boss.phase === 2 ? 'ENRAGED' : 'FRENZIED');
</script>

<!-- Boss health rail + name banner. Replaces the default monster tooltip during
     a boss fight (same name + HP, boss-styled). Slides in on engage; the HP fill
     drains crimson, segment ticks mark the phase thresholds (66% / 33%), and the
     frame intensifies with the fight via --fx. -->
<div
  class="boss-banner phase-{boss.phase}"
  style="--fx: {boss.intensity};"
  transition:fly={{ y: -28, duration: dur }}
  role="img"
  aria-label="{boss.name} (Boss), {boss.hp} of {boss.maxHp} health"
>
  <div class="head">
    <span class="title">
      <span class="name">{boss.name}</span>
      <span class="tag">Boss</span>
      {#if phaseLabel}
        <span class="phase" in:fade={{ duration: dur }}>{phaseLabel}</span>
      {/if}
    </span>
    <span class="hp-val">{boss.hp} / {boss.maxHp}</span>
  </div>
  <div
    class="track"
    role="progressbar"
    aria-valuenow={boss.hp}
    aria-valuemin={0}
    aria-valuemax={boss.maxHp}
  >
    <div class="fill" style="width: {fillPct}%;"></div>
    <span class="tick tick-66"></span>
    <span class="tick tick-33"></span>
  </div>
</div>

<style>
  .boss-banner {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 4;
    width: min(64%, 520px);
    padding: 8px 12px 10px;
    pointer-events: none;
    border-radius: var(--r-md, 8px);
    background: linear-gradient(
      180deg,
      rgba(20, 4, 6, 0.82),
      rgba(12, 2, 3, 0.7)
    );
    box-shadow:
      0 0 0 1px rgba(150, 18, 20, calc(0.45 + 0.45 * var(--fx))),
      0 0 18px rgba(150, 12, 14, calc(0.25 + 0.4 * var(--fx))),
      inset 0 0 22px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(3px);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }
  /* Name + tags grouped on the left; the HP readout pinned right. */
  .title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .name {
    font: 800 var(--fs-sm, 13px) var(--font-display, var(--font-ui));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #ffd9d2;
    text-shadow: 0 0 8px rgba(190, 30, 24, 0.7), 0 1px 2px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag {
    flex: none;
    font: 800 var(--fs-2xs, 10px) var(--font-display, var(--font-ui));
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #e88;
    opacity: 0.85;
  }
  .hp-val {
    flex: none;
    font: 700 var(--fs-2xs, 10px) var(--font-display, var(--font-ui));
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
    color: #ffd9d2;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  }
  .phase {
    font: 800 var(--fs-2xs, 10px) var(--font-display, var(--font-ui));
    letter-spacing: 0.14em;
    color: #ff5a45;
    text-shadow: 0 0 10px rgba(255, 60, 40, 0.8);
    animation: phase-flash 1.1s ease-in-out infinite;
  }
  .track {
    position: relative;
    height: 10px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.6);
    box-shadow: inset 0 0 0 1px rgba(120, 16, 16, 0.6);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, #5c0d0d, #c4201f 60%, #ff4a36);
    box-shadow: 0 0 10px rgba(255, 60, 40, calc(0.4 + 0.5 * var(--fx)));
    transition: width 360ms ease-out;
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(0, 0, 0, 0.7);
  }
  .tick-66 { left: 66%; }
  .tick-33 { left: 33%; }

  /* The frame breathes a touch harder each phase (faster, brighter). */
  .phase-2 { animation: boss-frame 2.2s ease-in-out infinite; }
  .phase-3 { animation: boss-frame 1.3s ease-in-out infinite; }

  @keyframes boss-frame {
    0%, 100% { box-shadow:
      0 0 0 1px rgba(150, 18, 20, 0.5),
      0 0 14px rgba(150, 12, 14, 0.3),
      inset 0 0 22px rgba(0, 0, 0, 0.55); }
    50% { box-shadow:
      0 0 0 1px rgba(220, 40, 36, 0.85),
      0 0 26px rgba(210, 30, 26, 0.6),
      inset 0 0 22px rgba(0, 0, 0, 0.55); }
  }
  @keyframes phase-flash {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .phase-2, .phase-3, .phase { animation: none; }
    .fill { transition: none; }
  }

  @media (max-width: 860px) {
    .boss-banner { width: min(86%, 420px); top: 10px; }
  }
</style>
