<script lang="ts">
  import { ui } from '../store.svelte';
  import MonsterTooltip from './MonsterTooltip.svelte';
  import MonsterPortrait from './MonsterPortrait.svelte';
  import ItemPickupCard from './ItemPickupCard.svelte';
  import BossBanner from './BossBanner.svelte';
  import EndRunScreen from './EndRunScreen.svelte';
  import EffectLayerHost from './EffectLayerHost.svelte';
  import DebugLogOverlay from './DebugLogOverlay.svelte';
  import { getDungeonStyle } from '../../theme';
  import { backgroundUrl, createFloorBackgroundPicker } from '../backgrounds';

  const dungeonStyle = $derived(getDungeonStyle(ui.floor));
  const floorBg = $derived(dungeonStyle.background);

  let backgroundPicker = createFloorBackgroundPicker();
  let currentBg = $state(backgroundPicker.pick(ui.floor));
  let previousBg = $state<string | null>(null);
  let isTransitioning = $state(false);

  let wasEnded = ui.gameOver || ui.gameWon;
  let lastFloor = ui.floor;
  let lastTurn = ui.turn;

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
    const isEnded = ui.gameOver || ui.gameWon;
    const floor = ui.floor;
    const turn = ui.turn;
    const isNewRun = (wasEnded && !isEnded) || turn < lastTurn;
    let cleanup: (() => void) | undefined = undefined;

    if (isNewRun) {
      backgroundPicker = createFloorBackgroundPicker();
      cleanup = transitionToBackground(backgroundPicker.pick(floor));
      lastFloor = floor;
    } else if (floor !== lastFloor) {
      cleanup = transitionToBackground(backgroundPicker.pick(floor));
      lastFloor = ui.floor;
    }

    wasEnded = isEnded;
    lastTurn = turn;
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

  <!-- The map lives on its own 3D plane, independent of the background art and
       HUD, so it can be moved/tilted/rotated in perspective for cosmetic effects.
       `.map-viewport` owns the perspective. Inside it:
       - `.map-transition` is the incoming-floor layer the active map renderer's
         FloorTransitionController drives (transform + opacity) on a floor change;
       - `.map-plane` (inside it) is the MapStageController rumble target;
       - `.map-ghost` (sibling, hidden at rest) holds a snapshot of the floor
         being left, crossfaded against the live canvas during a transition.
       - `.map-death-veil` is a map-local overlay for the death-transition
         handoff before the ending art/stat screen opens.
       All shrink-wrap the canvas so the flex stage still centers it.
       See design/active/map_3d_plane_plan.md. -->
  <div class="map-viewport">
    <div class="map-transition">
      <div class="map-plane">
        <!-- Intrinsic size is set imperatively by the active map renderer to
             board × tile size (it owns the backing store so resizes land before paints). These
             static attributes are just the pre-first-paint default (46×29 × 20). -->
        <canvas id="gameCanvas" width="920" height="580"></canvas>
      </div>
    </div>
    <!-- Outgoing-floor snapshot, painted over the live canvas only during a
         transition (display toggled by the controller). -->
    <div class="map-ghost" aria-hidden="true">
      <canvas id="ghostCanvas"></canvas>
    </div>
    <div class="map-death-veil" aria-hidden="true"></div>

    <!-- Combat portrait of the monster being fought. Sits inside .map-viewport so
         it anchors to a corner of the board canvas; the chrome projection picks a
         corner whose oval footprint is clear of drawn rooms. -->
    {#if ui.combatPortrait}
      <MonsterPortrait portrait={ui.combatPortrait} />
    {/if}

    <!-- Framed card of the item just collected. Mirrors the combat portrait: the
         chrome projection picks a clear corner distinct from the portrait's. -->
    {#if ui.itemPickup}
      <ItemPickupCard pickup={ui.itemPickup} />
    {/if}
  </div>

  <div class="vignette" aria-hidden="true"></div>
  <!-- Danger washes / above-board atmosphere (survival warning + boss tension). -->
  <EffectLayerHost effects={ui.visualEffects} target="stage-overlay" />

  <!-- Boss health rail + name banner, shown while a boss fight is engaged. -->
  {#if ui.bossEncounter}
    <BossBanner boss={ui.bossEncounter} />
  {/if}



  {#if ui.stairsNearby}
    <div class="stairs-pill">
      <span class="stairs-icon stairs-icon--down" aria-hidden="true"></span>
      <span class="text">Stairs nearby</span>
    </div>
  {/if}

  <!-- The default nearby-monster tooltip yields to the boss banner during a boss
       fight, so the two never overlap (the banner carries the same HP + name). -->
  {#if ui.nearbyMonster && !ui.bossEncounter}
    <MonsterTooltip />
  {/if}

  {#if ui.aiming}
    <div class="aim-prompt" role="status" aria-live="polite">
      <span class="aim-title">Zap {ui.aiming.wandName}</span>
      <span class="aim-hint">Choose a direction — WASD / Arrows · Esc to cancel</span>
    </div>
  {/if}

  <DebugLogOverlay />

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
  /* Perspective container for the map. Shrink-wraps the plane (which shrink-wraps
     the canvas) so the flex stage keeps centering the board. The perspective is
     what makes the plane's translateZ/rotateX read as depth rather than a flat
     scale; perspective-origin sits slightly high so a forward jolt feels grounded. */
  .map-viewport {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    perspective: 900px;
    perspective-origin: 50% 45%;
  }
  /* Incoming-floor layer the FloorTransitionController writes (transform +
     opacity) during a floor change. Identity/opaque at rest. */
  .map-transition {
    position: relative;
    transform-style: preserve-3d;
    transform-origin: center center;
    will-change: transform, opacity;
  }
  /* The rumble target the active map renderer's MapStageController writes to. Identity at rest
     (so the board renders pixel-identical when no effect is playing). */
  .map-plane {
    position: relative;
    transform-style: preserve-3d;
    will-change: transform;
  }
  /* Outgoing-floor snapshot. Absolutely overlaid on the live canvas, centered the
     same way, shown only mid-transition (display toggled in JS). Painted above
     the live layer so the old floor fades out to reveal the new beneath. */
  .map-ghost {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    transform-style: preserve-3d;
    transform-origin: center center;
    will-change: transform, opacity;
  }
  .map-death-veil {
    position: absolute;
    inset: 0;
    z-index: 5;
    opacity: 0;
    pointer-events: none;
    will-change: opacity, background;
  }
  canvas {
    display: block;
    position: relative;
    /* Intrinsic CSS width/height and any player-centering transform are set
       imperatively by the active map renderer, which fits the board to this stage. */
    transform-origin: center center;
    touch-action: none;
  }
  /* Reduced motion is also enforced in JS (effects are no-ops / dissolve), but
     guard here too so any future CSS-driven plane motion is covered. */
  @media (prefers-reduced-motion: reduce) {
    .map-plane,
    .map-transition {
      transform: none !important;
    }
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
