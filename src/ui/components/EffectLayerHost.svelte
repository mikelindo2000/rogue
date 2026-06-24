<script lang="ts">
  import { fade } from 'svelte/transition';
  import {
    visualEffectStyle,
    type VisualEffectInstance,
    type VisualEffectTarget,
  } from '../visualEffects';

  interface Props {
    effects?: VisualEffectInstance[];
    target: VisualEffectTarget;
  }

  let { effects = [], target }: Props = $props();

  // Filter to this target and paint low layer → high. Decorative only.
  const layers = $derived(
    effects.filter((e) => e.target === target).sort((a, b) => a.layer - b.layer)
  );

  const fadeDuration = (effect: VisualEffectInstance) =>
    effect.kind === 'floor-chrome-texture' ? 700 : 120;
</script>

<div class="effect-host" data-target={target} aria-hidden="true">
  {#each layers as effect (effect.id)}
    <div
      class={`effect-layer ${effect.className}`}
      style={visualEffectStyle(effect)}
      transition:fade={{ duration: fadeDuration(effect) }}
    ></div>
  {/each}
</div>
