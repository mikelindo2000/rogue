<script lang="ts">
  import { ui } from '../store.svelte';
  import MonsterTooltip from './MonsterTooltip.svelte';
  import EndRunScreen from './EndRunScreen.svelte';
  import EffectLayerHost from './EffectLayerHost.svelte';
  import { getDungeonStyle } from '../../theme';
  import { backgroundUrl, pickFloorBackground } from '../backgrounds';

  const dungeonStyle = $derived(getDungeonStyle(ui.floor));
  const floorBg = $derived(dungeonStyle.background);

  let currentBg = $state(pickFloorBackground(ui.floor));
  let previousBg = $state<string | null>(null);
  let isTransitioning = $state(false);

  let wasEnded = false;
  let lastFloor = ui.floor;

  function transitionToBackground(nextBg: string) {
    if (nextBg === currentBg) return;
    previousBg = currentBg;
    currentBg = nextBg;
    isTransitioning = true;
    const timer = setTimeout(() => {
      previousBg = null;
      isTransitioning = false;
    }, 1000);
    return () => clearTimeout(timer);
  }

  $effect(() => {
    const floor = ui.floor;
    let cleanup: (() => void) | undefined = undefined;
    if (floor !== lastFloor) {
      cleanup = transitionToBackground(pickFloorBackground(floor));
      lastFloor = floor;
    }
    return cleanup;
  });

  $effect(() => {
    const isEnded = ui.gameOver || ui.gameWon;
    let cleanup: (() => void) | undefined = undefined;
    if (wasEnded && !isEnded) {
      lastFloor = ui.floor;
      cleanup = transitionToBackground(pickFloorBackground(ui.floor));
    }
    wasEnded = isEnded;
    return cleanup;
  });
</script>

<div class="stage" style="background-color: {floorBg};">
  <div class="bg-image-container" aria-hidden="true">
    {#if previousBg}
      <img src={backgroundUrl(previousBg)} class="bg-image fade-out" alt="" />
    {/if}
    <img src={backgroundUrl(currentBg)} class="bg-image" class:fade-in={isTransitioning} alt="" />
  </div>

  <!-- Atmosphere between the background art and the canvas (e.g. floor fog). -->
  <EffectLayerHost effects={ui.visualEffects} target="stage-backdrop" />

  <!-- Intrinsic size is set imperatively by GameUI.paint() to board × tile size
       (it owns the backing store so resizes land before paints). These static
       attributes are just the pre-first-paint default (classic 46×29 × 20). -->
  <canvas id="gameCanvas" width="920" height="580"></canvas>

  <div class="vignette" aria-hidden="true"></div>
  <!-- Danger washes / above-board atmosphere (survival warning lives here). -->
  <EffectLayerHost effects={ui.visualEffects} target="stage-overlay" />

  {#if ui.stairsNearby}
    <div class="stairs-pill">
      <span class="stairs-icon stairs-icon--down" aria-hidden="true"></span>
      <span class="text">Stairs nearby</span>
    </div>
  {/if}

  {#if ui.nearbyMonster}
    <MonsterTooltip />
  {/if}

  {#if ui.aiming}
    <div class="aim-prompt" role="status" aria-live="polite">
      <span class="aim-title">Zap {ui.aiming.wandName}</span>
      <span class="aim-hint">Choose a direction — WASD / Arrows · Esc to cancel</span>
    </div>
  {/if}

  <EndRunScreen />
</div>

<style>
  .stage {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    overflow: hidden;
    background: var(--surface-map);
  }
  .bg-image-container {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .bg-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.35;
    transition: opacity 1000ms ease-in-out;
  }
  .bg-image.fade-out {
    opacity: 0;
  }
  .bg-image.fade-in {
    animation: fadeIn 1000ms ease-in-out forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 0.35;
    }
  }
  canvas {
    display: block;
    position: relative;
    z-index: 1;
    /* Intrinsic CSS width/height and any player-centering transform are set
       imperatively by GameUI.paint(), which fits the board to this stage. */
    transform-origin: center center;
    touch-action: none;
  }
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
    background: radial-gradient(130% 120% at 52% 46%, transparent 46%, rgba(0, 0, 0, 0.6));
  }
  .stairs-pill {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 11px;
    background: var(--surface-overlay);
    backdrop-filter: blur(6px);
    border: 1px solid var(--border-chip);
    border-radius: var(--r-md);
  }
  .stairs-pill .stairs-icon {
    flex: none;
    width: 14px;
    height: 14px;
  }
  .stairs-pill .text {
    font: 500 var(--fs-sm) var(--font-ui);
    color: var(--text-muted);
  }
  .aim-prompt {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 4;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 16px;
    background: var(--surface-overlay);
    backdrop-filter: blur(6px);
    border: 1px solid var(--accent);
    border-radius: var(--r-md);
    text-align: center;
    pointer-events: none;
    animation: aimPulse 1.4s ease-in-out infinite;
  }
  .aim-prompt .aim-title {
    font: 700 var(--fs-sm) var(--font-display);
    color: var(--accent);
    letter-spacing: 0.02em;
  }
  .aim-prompt .aim-hint {
    font: 500 var(--fs-xs, 11px) var(--font-ui);
    color: var(--text-muted);
  }
  @keyframes aimPulse {
    0%, 100% { border-color: var(--accent); }
    50% { border-color: var(--border-chip); }
  }

  @media (max-width: 860px) {
    .stairs-pill {
      top: 10px;
      left: 10px;
    }

    .aim-prompt {
      width: min(92vw, 360px);
      bottom: 10px;
      padding: 8px 10px;
    }
  }

</style>
