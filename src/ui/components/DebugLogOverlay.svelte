<script lang="ts">
  import { ui } from '../store.svelte';
  import Icon from './primitives/Icon.svelte';
  import { fade, slide } from 'svelte/transition';

  let copiedId = $state<string | null>(null);

  function copyMessage(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 1000);
    });
  }
</script>

{#if ui.showSoundDebug && ui.debugMessages.length > 0}
  <div class="debug-overlay" transition:fade={{ duration: 150 }}>
    <div class="header">SOUND LOG</div>
    <div class="list">
      {#each ui.debugMessages as msg (msg.id)}
        <div class="message-row" transition:slide={{ duration: 150 }}>
          <span class="message-text">{msg.text}</span>
          <button
            class="copy-btn"
            class:copied={copiedId === msg.id}
            onclick={() => copyMessage(msg.text, msg.id)}
            aria-label="Copy sound name"
            title="Copy sound name"
          >
            <Icon name="copy" size={12} />
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .debug-overlay {
    position: absolute;
    top: 56px;
    left: 14px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 220px;
    pointer-events: none;
    font-family: var(--font-ui);
  }

  .header {
    font: 600 var(--fs-label) var(--font-display);
    letter-spacing: var(--tracking-caps);
    color: var(--text-dimmer);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    padding-left: 4px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 250px;
    overflow-y: auto;
    /* Custom scrollbars to look nice */
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }

  .list::-webkit-scrollbar {
    width: 4px;
  }
  .list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: var(--r-pill);
  }

  .message-row {
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    background: var(--surface-overlay);
    backdrop-filter: blur(6px);
    border: 1px solid var(--border-chip);
    border-radius: var(--r-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    transition: border-color var(--dur-fast) var(--ease);
  }

  .message-row:hover {
    border-color: rgba(224, 164, 90, 0.3);
  }

  .message-text {
    font: 500 var(--fs-xs) var(--font-mono);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .copy-btn {
    appearance: none;
    background: none;
    border: none;
    padding: 2px;
    margin: 0;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--r-2xs);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--dur-fast) var(--ease);
  }

  .copy-btn:hover {
    color: var(--accent);
    background: rgba(224, 164, 90, 0.15);
  }

  .copy-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .copy-btn.copied {
    color: var(--good);
    background: rgba(95, 184, 122, 0.15);
  }
</style>
