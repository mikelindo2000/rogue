<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { ItemPickupOverlay } from '../store.svelte';

  let { pickup }: { pickup: ItemPickupOverlay } = $props();

  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const dur = reduce ? 0 : 280;
</script>

<!-- Anchored to a corner of the board canvas (this lives inside .map-viewport,
     which shrink-wraps the canvas). The chosen corner is guaranteed clear of the
     drawn map and distinct from the combat portrait's corner, so the card never
     covers a room and the two overlays never overlap. -->
<div
  class="pickup corner-{pickup.corner}"
  style="--size: {pickup.sizePx}px; --rc: {pickup.rarityColor};"
  transition:fade={{ duration: dur }}
  aria-hidden="true"
>
  <div class="card">
    <div class="art">
      <img src={pickup.artUrl} alt="" draggable="false" />
    </div>
    <div class="label">
      <div class="name">{pickup.name}</div>
      {#if pickup.statLabel}
        <div class="stat">{pickup.statLabel}</div>
      {/if}
      {#if pickup.comparisonLabel}
        <div class="comparison {pickup.comparisonTone ?? 'same'}">{pickup.comparisonLabel}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .pickup {
    position: absolute;
    width: var(--size);
    z-index: 4;
    pointer-events: none;
    filter: drop-shadow(0 8px 22px rgba(0, 0, 0, 0.55));
  }
  .corner-tl { top: 12px; left: 12px; }
  .corner-tr { top: 12px; right: 12px; }
  .corner-bl { bottom: 12px; left: 12px; }
  .corner-br { bottom: 12px; right: 12px; }

  /* A rounded card with a layered frame mirroring the combat portrait: a dark
     bezel, a rarity-tinted accent ring, and an inner shadow so the art reads
     against the rim. */
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border-radius: 12px;
    background: var(--surface-overlay);
    box-shadow:
      0 0 0 2px rgba(0, 0, 0, 0.85),
      0 0 0 4px color-mix(in srgb, var(--rc) 70%, transparent),
      0 0 0 6px rgba(0, 0, 0, 0.7),
      inset 0 0 18px rgba(0, 0, 0, 0.6);
  }
  .art {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.35);
  }
  .art img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .label {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
  }
  .name {
    max-width: 100%;
    font: 700 var(--fs-xs, 11px) var(--font-display, var(--font-ui));
    letter-spacing: 0.03em;
    color: var(--rc);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stat {
    font: 600 var(--fs-2xs, 10px) var(--font-ui);
    color: var(--text-muted);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
  }
  .comparison {
    font: 700 var(--fs-2xs, 10px) var(--font-ui);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
  }
  .comparison.better { color: var(--good); }
  .comparison.same { color: var(--text-muted); }
  .comparison.worse { color: var(--danger); }
</style>
