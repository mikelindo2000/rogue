<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title,
    onClose,
    children,
  }: {
    open?: boolean;
    title?: string;
    onClose?: () => void;
    children: Snippet;
  } = $props();

  let windowEl = $state<HTMLElement | null>(null);

  function close() {
    open = false;
    onClose?.();
  }
  function onKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  $effect(() => {
    if (open) windowEl?.focus();
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -- backdrop is a mouse
       dismiss affordance; Escape and the close button are the accessible paths -->
  <div
    class="backdrop"
    onpointerdown={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      class="window"
      bind:this={windowEl}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {#if title}
        <div class="head">
          <h2>{title}</h2>
          <button class="x" onclick={close} aria-label="Close">✕</button>
        </div>
      {/if}
      <div class="content">{@render children()}</div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    animation: fade var(--dur) var(--ease);
  }
  .window {
    display: flex;
    flex-direction: column;
    max-width: 80vw;
    max-height: 84vh;
    background: var(--surface-app);
    border: 1px solid var(--border-popover);
    border-radius: var(--r-2xl);
    box-shadow: var(--shadow-pop);
    outline: none;
    overflow: hidden;
    animation: rise var(--dur) var(--ease-spring);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-bar);
  }
  .head h2 {
    margin: 0;
    font: 600 var(--fs-title) var(--font-display);
    letter-spacing: var(--tracking-tight);
    color: var(--text-bright);
  }
  .x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border-slot);
    border-radius: var(--r-md);
    background: var(--surface-inset);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    transition:
      color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }
  .x:hover {
    color: var(--text-bright);
    border-color: var(--border-strong);
  }
  .content {
    min-height: 0;
    overflow: auto;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: scale(0.97) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
