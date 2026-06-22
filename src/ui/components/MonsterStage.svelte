<script lang="ts">
  import { onMount } from 'svelte';
  import type { MonsterTemplate } from '../../types';
  import { MonsterStage } from '../../render/stage';
  import { monsterArtUrl } from '../monsterArt';

  let {
    monster,
    heroGlyph = '@',
  }: {
    monster: MonsterTemplate;
    heroGlyph?: string;
  } = $props();

  let canvas: HTMLCanvasElement;
  let stage: MonsterStage | null = null;
  const artUrl = $derived(monsterArtUrl(monster));

  onMount(() => {
    stage = new MonsterStage(canvas, {
      symbol: monster.symbol,
      color: monster.color,
      boss: monster.special === 'boss',
    }, {
      glyph: heroGlyph,
    });
    stage.start();
    return () => {
      stage?.stop();
      stage = null;
    };
  });

  $effect(() => {
    stage?.setHero({ glyph: heroGlyph });
  });
</script>

<div class="stage">
  <div
    class="art-bg"
    style:background-image={`url("${artUrl}")`}
    aria-hidden="true"
  ></div>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
  <span class="caption">Sparring preview</span>
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 260px;
    background:
      radial-gradient(120% 90% at 50% 30%, var(--surface-inset) 0%, var(--surface-inset-2) 100%);
    border: 1px solid var(--border-slot);
    border-radius: var(--r-lg);
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  .stage::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    background:
      radial-gradient(80% 70% at 50% 42%, rgba(17, 19, 26, 0.04), rgba(17, 19, 26, 0.5)),
      linear-gradient(180deg, rgba(17, 19, 26, 0.08), rgba(17, 19, 26, 0.58));
    pointer-events: none;
  }
  .art-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-position: center top;
    background-size: cover;
    opacity: 0.8;
    filter: saturate(0.9) contrast(1.08);
    pointer-events: none;
  }
  canvas {
    position: relative;
    z-index: 2;
    display: block;
    width: 100%;
    height: 100%;
  }
  .caption {
    position: absolute;
    bottom: 8px;
    right: 10px;
    z-index: 3;
    font: 600 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
    pointer-events: none;
  }
</style>
