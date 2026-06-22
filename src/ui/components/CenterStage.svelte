<script lang="ts">
  import { ui } from '../store.svelte';
  import MonsterTooltip from './MonsterTooltip.svelte';
  import KeyCap from './primitives/KeyCap.svelte';
</script>

<div class="stage">
  <canvas id="gameCanvas" width="920" height="580"></canvas>

  <div class="vignette" aria-hidden="true"></div>

  {#if ui.stairsNearby}
    <div class="stairs-pill">
      <span class="caret">&gt;</span>
      <span class="text">Descend stairs nearby</span>
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
