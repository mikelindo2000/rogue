<script lang="ts">
  import { ui, actions } from '../store.svelte';
  import HowToPlay from './HowToPlay.svelte';
  import Icon from './primitives/Icon.svelte';

  // Pre-generated ElevenLabs narration of the warning, played only on demand.
  // Served from public/ at /audio/voice/. See design/implemented for the script.
  const NARRATION_URL = '/audio/voice/intro-warning-01.mp3';

  let enterButton = $state<HTMLButtonElement | null>(null);
  let narrating = $state(false);
  let narration: HTMLAudioElement | null = null;

  function toggleNarration() {
    // Lazily build the element on first use (also a user gesture → audio is
    // allowed to play). It is deliberately independent of the SFX mute: hitting
    // "hear the warning" is explicit intent.
    if (!narration) {
      narration = new Audio(NARRATION_URL);
      narration.addEventListener('ended', () => (narrating = false));
      narration.addEventListener('pause', () => (narrating = false));
    }
    if (narrating) {
      narration.pause();
      narration.currentTime = 0;
      narrating = false;
      return;
    }
    narration.currentTime = 0;
    void narration.play().then(() => (narrating = true)).catch(() => (narrating = false));
  }

  function stopNarration() {
    if (narration && !narration.paused) {
      narration.pause();
      narration.currentTime = 0;
    }
    narrating = false;
  }

  $effect(() => {
    if (ui.introOpen) {
      requestAnimationFrame(() => enterButton?.focus());
    } else {
      // Gate dismissed — silence any in-progress narration.
      stopNarration();
    }
  });

  function onKeydown(e: KeyboardEvent) {
    if (!ui.introOpen) return;
    // The obvious "continue" keys dismiss the gate. Game input is suspended
    // underneath (main.ts), so other keys are harmless no-ops here.
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      actions.dismissIntro();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if ui.introOpen}
  <div class="intro" role="dialog" aria-modal="true" aria-label="How to play" tabindex="-1">
    <div class="panel">
      <header class="head">
        <p class="eyebrow">Rogue: DungeonMaster</p>
        <h1>Enter, if you dare</h1>
      </header>

      <HowToPlay variant="intro" />

      <footer class="actions">
        <button bind:this={enterButton} class="primary" type="button" onclick={() => actions.dismissIntro()}>
          Enter the dungeon
        </button>
        <button class="ghost" type="button" aria-pressed={narrating} onclick={toggleNarration}>
          <Icon name={narrating ? 'mute' : 'volume'} size={15} />
          {narrating ? 'Stop the warning' : 'Hear the warning'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .intro {
    position: fixed;
    inset: 0;
    z-index: 9;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(6px);
    outline: none;
  }
  .panel {
    width: min(640px, 96vw);
    max-height: min(760px, 92vh);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 26px 28px;
    border: 1px solid var(--border-popover);
    border-radius: var(--r-xl);
    background: var(--surface-app);
    box-shadow: var(--shadow-pop);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .eyebrow {
    margin: 0;
    font: 700 9px var(--font-display);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-label);
  }
  .head h1 {
    margin: 0;
    font: 600 var(--fs-hero, 28px) var(--font-display);
    letter-spacing: var(--tracking-tight);
    color: var(--text-bright);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 2px;
  }
  .primary {
    min-height: 38px;
    padding: 0 20px;
    border: 1px solid var(--accent-border);
    border-radius: var(--r-md);
    background: var(--accent-surface);
    color: var(--text-bright);
    font: 700 13px var(--font-display);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }
  .primary:hover,
  .primary:focus-visible {
    background: var(--accent-log-surface);
    border-color: var(--accent);
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    padding: 0 16px;
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
    background: var(--surface-inset);
    color: var(--text-muted);
    font: 600 12px var(--font-display);
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  .ghost:hover,
  .ghost:focus-visible {
    color: var(--text-bright);
    border-color: var(--border-strong);
  }
  .ghost[aria-pressed='true'] {
    color: var(--text-bright);
    border-color: var(--accent-border);
    background: var(--accent-surface);
  }

  @media (max-width: 560px) {
    .panel {
      padding: 18px 16px;
    }
  }
</style>
