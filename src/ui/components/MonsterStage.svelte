<script lang="ts">
  import { onMount } from 'svelte';
  import type { MonsterTemplate } from '../../types';
  import { MonsterStage } from '../../render/stage';

  let { monster }: { monster: MonsterTemplate } = $props();

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const stage = new MonsterStage(canvas, {
      symbol: monster.symbol,
      color: monster.color,
      boss: monster.special === 'boss',
    });
    stage.start();
    return () => stage.stop();
  });
</script>

<div class="stage">
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
  <span class="caption">Sparring preview</span>
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 200px;
    background:
      radial-gradient(120% 90% at 50% 30%, var(--surface-inset) 0%, var(--surface-inset-2) 100%);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-lg);
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .caption {
    position: absolute;
    bottom: 8px;
    right: 10px;
    font: 600 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
    pointer-events: none;
  }
</style>
