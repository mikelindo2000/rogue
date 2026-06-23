<script lang="ts">
  import { ui } from '../store.svelte';
  import MonsterTooltip from './MonsterTooltip.svelte';
  import KeyCap from './primitives/KeyCap.svelte';
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

<div class="stage" style="background-color: {floorBg};">
  <div class="bg-image-container" aria-hidden="true">
    {#if previousBg}
      <img src={backgroundUrl(previousBg)} class="bg-image fade-out" alt="" />
    {/if}
    <img src={backgroundUrl(currentBg)} class="bg-image" class:fade-in={isTransitioning} alt="" />
  </div>

  <canvas id="gameCanvas" width="920" height="580"></canvas>

  <div class="vignette" aria-hidden="true"></div>

  {#if ui.stairsNearby}
    <div class="stairs-pill">
      <span class="caret">&gt;</span>
      <span class="text">Stairs nearby</span>
    </div>
  {/if}

  {#if ui.nearbyMonster}
    <MonsterTooltip />
  {/if}

  {#if ui.gameOver || ui.gameWon}
    <div class="end-overlay">
      <div class="end-card" class:won={ui.gameWon}>
        <div class="end-title">{ui.gameWon ? 'Victory' : 'You died'}</div>
        <div class="end-sub">
          {ui.gameWon ? 'You escaped the dungeon.' : 'The dungeon claims another.'}
        </div>
        <div class="end-hint">Press <KeyCap>R</KeyCap> to restart</div>
      </div>
    </div>
  {/if}
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
  .stairs-pill .caret {
    font: 700 12px var(--font-display);
    color: var(--accent);
  }
  .stairs-pill .text {
    font: 500 var(--fs-sm) var(--font-ui);
    color: var(--text-muted);
  }
  .end-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
  }
  .end-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 28px 40px;
    background: var(--surface-popover);
    border: 1px solid var(--danger);
    border-radius: var(--r-2xl);
    box-shadow: var(--shadow-pop);
    text-align: center;
  }
  .end-card.won {
    border-color: var(--accent);
  }
  .end-title {
    font: 700 24px var(--font-display);
    letter-spacing: var(--tracking-tight);
    color: var(--danger);
  }
  .end-card.won .end-title {
    color: var(--accent);
  }
  .end-sub {
    font: 500 var(--fs-body) var(--font-ui);
    color: var(--text-muted);
  }
  .end-hint {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font: 500 var(--fs-sm) var(--font-ui);
    color: var(--text-dim);
  }
</style>
