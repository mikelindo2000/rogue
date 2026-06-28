<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { CombatPortrait } from '../store.svelte';
  import { assetReadinessService, type AssetReadinessHandle } from '../../assets/readiness';
  import { combatPortraitArtUrlForReadiness } from '../../assets/imageLoadPlans';

  let { portrait }: { portrait: CombatPortrait } = $props();

  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const dur = reduce ? 0 : 280;

  const artUrl = $derived(combatPortraitArtUrlForReadiness(portrait) ?? '');
  const hpRatio = $derived(
    portrait.maxHp > 0 ? Math.max(0, Math.min(1, portrait.hp / portrait.maxHp)) : 0
  );

  $effect(() => {
    if (!artUrl) return;
    const handle: AssetReadinessHandle = assetReadinessService.requestImage({
      kind: 'image',
      url: artUrl,
      priority: 'critical-now',
      reason: 'current combat target portrait',
      owner: 'monster-portrait',
      optional: true,
      isStale: () => combatPortraitArtUrlForReadiness(portrait) !== artUrl,
    });

    return () => handle.cancel();
  });
</script>

<!-- Anchored to a corner of the board canvas (this lives inside .map-viewport,
     which shrink-wraps the canvas). The chosen corner is guaranteed clear of the
     drawn map, so the oval never covers a room. -->
<div
  class="portrait corner-{portrait.corner}"
  style="--size: {portrait.sizePx}px; --mc: {portrait.color};"
  transition:fade={{ duration: dur }}
  aria-hidden="true"
>
  <div class="frame">
    <img src={artUrl} alt="" draggable="false" />
    <div class="vignette"></div>
  </div>
  <div class="hp" style="--hp: {hpRatio}"></div>
  <div class="name">{portrait.name}</div>
</div>

<style>
  .portrait {
    position: absolute;
    width: var(--size);
    z-index: 4;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    filter: drop-shadow(0 8px 22px rgba(0, 0, 0, 0.55));
  }
  .corner-tl { top: 12px; left: 12px; }
  .corner-tr { top: 12px; right: 12px; }
  .corner-bl { bottom: 12px; left: 12px; }
  .corner-br { bottom: 12px; right: 12px; }

  /* The oval art window with a layered frame: a dark bezel, a color-tinted accent
     ring drawn from the monster's palette, and a soft inner vignette so the art
     reads against the rim. */
  .frame {
    position: relative;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface-overlay);
    box-shadow:
      0 0 0 2px rgba(0, 0, 0, 0.85),
      0 0 0 4px color-mix(in srgb, var(--mc) 70%, transparent),
      0 0 0 6px rgba(0, 0, 0, 0.7),
      inset 0 0 18px rgba(0, 0, 0, 0.6);
  }
  .frame img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Bias toward the top so faces aren't cropped by the oval. */
    object-position: 50% 22%;
  }
  .vignette {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(120% 120% at 50% 35%, transparent 52%, rgba(0, 0, 0, 0.65));
  }
  /* Thin HP arc beneath the portrait, tinted from the monster color. */
  .hp {
    width: calc(var(--size) * 0.66);
    height: 4px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    overflow: hidden;
    position: relative;
  }
  .hp::after {
    content: '';
    position: absolute;
    inset: 0;
    transform-origin: left center;
    transform: scaleX(var(--hp));
    background: color-mix(in srgb, var(--mc) 85%, white 10%);
    transition: transform var(--dur-slow, 240ms) var(--ease, ease);
  }
  .name {
    max-width: calc(var(--size) + 16px);
    font: 700 var(--fs-xs, 11px) var(--font-display, var(--font-ui));
    letter-spacing: 0.03em;
    color: var(--text-muted);
    text-align: center;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
