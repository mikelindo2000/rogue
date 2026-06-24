<script lang="ts">
  import { ui } from '../store.svelte';
  import MonsterTooltip from './MonsterTooltip.svelte';
  import EndRunScreen from './EndRunScreen.svelte';
  import { getDungeonStyle } from '../../theme';
  import { pickRandomBg, backgroundUrl } from '../backgrounds';

  const dungeonStyle = $derived(getDungeonStyle(ui.floor));
  const floorBg = $derived(dungeonStyle.background);

  let currentBg = $state(pickRandomBg());
  let previousBg = $state<string | null>(null);
  let isTransitioning = $state(false);

  let wasEnded = false;

  $effect(() => {
    const isEnded = ui.gameOver || ui.gameWon;
    let cleanup: (() => void) | undefined = undefined;
    if (wasEnded && !isEnded) {
      previousBg = currentBg;
      currentBg = pickRandomBg();
      isTransitioning = true;
      const timer = setTimeout(() => {
        previousBg = null;
        isTransitioning = false;
      }, 1000);
      cleanup = () => clearTimeout(timer);
    }
    wasEnded = isEnded;
    return cleanup;
  });
</script>

<div
  class="stage"
  style="background-color: {floorBg}; --player-x: {ui.playerX + 0.5}; --player-y: {ui.playerY + 0.5}; --map-cols: {ui.mapCols}; --map-rows: {ui.mapRows};"
>
  <div class="bg-image-container" aria-hidden="true">
    {#if previousBg}
      <img src={backgroundUrl(previousBg)} class="bg-image fade-out" alt="" />
    {/if}
    <img src={backgroundUrl(currentBg)} class="bg-image" class:fade-in={isTransitioning} alt="" />
  </div>

  <!-- Intrinsic size is set imperatively by GameUI.paint() to board × tile size
       (it owns the backing store so resizes land before paints). These static
       attributes are just the pre-first-paint default (classic 46×29 × 20). -->
  <canvas id="gameCanvas" width="920" height="580"></canvas>

  <div class="vignette" aria-hidden="true"></div>
  <div
    class="survival-wash"
    class:hunger={ui.survivalWarningTone === 'hunger'}
    class:health={ui.survivalWarningTone === 'health'}
    class:both={ui.survivalWarningTone === 'both'}
    style:--survival-intensity={ui.survivalWarningIntensity}
    aria-hidden="true"
  ></div>

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
    width: min(920px, calc(100% - 32px));
    height: auto;
    max-height: calc(100% - 32px);
    touch-action: none;
  }
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
    background: radial-gradient(130% 120% at 52% 46%, transparent 46%, rgba(0, 0, 0, 0.6));
  }
  .survival-wash {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    opacity: 0;
    --survival-wash: transparent;
    --survival-grain: transparent;
    --survival-rim: transparent;
    --survival-pulse-min: 0;
    --survival-pulse-max: 0;
    background:
      radial-gradient(circle at 50% 45%, transparent 34%, var(--survival-wash) 100%),
      linear-gradient(90deg, var(--survival-rim), transparent 18%, transparent 82%, var(--survival-rim)),
      repeating-linear-gradient(135deg, transparent 0 8px, var(--survival-grain) 8px 9px);
    mix-blend-mode: screen;
    animation: survival-pulse 3s var(--ease) infinite;
  }
  .survival-wash.hunger {
    --survival-wash: rgba(206, 130, 48, calc(0.18 * var(--survival-intensity)));
    --survival-grain: rgba(236, 176, 83, calc(0.12 * var(--survival-intensity)));
    --survival-rim: rgba(224, 162, 63, calc(0.1 * var(--survival-intensity)));
    --survival-pulse-min: calc(0.24 * var(--survival-intensity));
    --survival-pulse-max: calc(0.5 * var(--survival-intensity));
  }
  .survival-wash.health {
    --survival-wash: rgba(196, 48, 42, calc(0.18 * var(--survival-intensity)));
    --survival-grain: rgba(235, 92, 74, calc(0.09 * var(--survival-intensity)));
    --survival-rim: rgba(217, 84, 74, calc(0.13 * var(--survival-intensity)));
    --survival-pulse-min: calc(0.22 * var(--survival-intensity));
    --survival-pulse-max: calc(0.54 * var(--survival-intensity));
    animation-duration: 2.25s;
  }
  .survival-wash.both {
    --survival-wash: rgba(132, 45, 114, calc(0.22 * var(--survival-intensity)));
    --survival-grain: rgba(224, 162, 63, calc(0.11 * var(--survival-intensity)));
    --survival-rim: rgba(217, 84, 74, calc(0.15 * var(--survival-intensity)));
    --survival-pulse-min: calc(0.28 * var(--survival-intensity));
    --survival-pulse-max: calc(0.64 * var(--survival-intensity));
    animation-duration: 1.65s;
  }
  @keyframes survival-pulse {
    0%, 100% {
      opacity: var(--survival-pulse-min);
    }
    45% {
      opacity: var(--survival-pulse-max);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .survival-wash {
      animation: none;
      opacity: var(--survival-pulse-min);
    }
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

  @media (max-width: 560px) {
    canvas {
      position: absolute;
      left: 50%;
      top: 50%;
      max-height: none;
      transform-origin: 0 0;
      transform:
        scale(1.46)
        translate(
          calc(-1 * (var(--player-x) / var(--map-cols)) * 100%),
          calc(-1 * (var(--player-y) / var(--map-rows)) * 100%)
        );
    }
  }
</style>
