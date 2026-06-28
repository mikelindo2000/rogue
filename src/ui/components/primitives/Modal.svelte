<script module lang="ts">
  // Shared stack of open modals. Every Modal listens for Escape on `window`, so
  // when modals are nested (e.g. a monster preview over the bestiary) each
  // window listener fires for the same keypress. The stack lets only the
  // topmost modal act, so one Escape dismisses one layer instead of all of them.
  const modalStack: symbol[] = [];
  const isTopmost = (token: symbol) => modalStack[modalStack.length - 1] === token;
  function pushModal(token: symbol) {
    if (!modalStack.includes(token)) modalStack.push(token);
  }
  function removeModal(token: symbol) {
    const i = modalStack.indexOf(token);
    if (i !== -1) modalStack.splice(i, 1);
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';

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

  const token = Symbol('modal');
  let windowEl = $state<HTMLElement | null>(null);
  let previousActive: HTMLElement | null = null;

  function close() {
    open = false;
    onClose?.();
    previousActive?.focus?.();
    previousActive = null;
  }

  function focusables(): HTMLElement[] {
    if (!windowEl) return [];
    return Array.from(
      windowEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      // Only the topmost open modal responds, so nested modals close one layer
      // at a time rather than all collapsing on a single Escape.
      if (!isTopmost(token)) return;
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === 'Tab') {
      // Trap focus within the dialog.
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        windowEl?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === windowEl)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  $effect(() => {
    if (open) {
      pushModal(token);
      previousActive = document.activeElement as HTMLElement | null;
      windowEl?.focus();
    } else {
      removeModal(token);
    }
  });

  onDestroy(() => removeModal(token));
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -- backdrop is a mouse
     dismiss affordance; Escape and the close button are the accessible paths.
     Keep the subtree mounted while closed: repeated Svelte snippet teardown left
     detached modal bodies retained by Chrome after open/close churn. -->
<div
  class="backdrop"
  hidden={!open}
  aria-hidden={open ? undefined : 'true'}
  onpointerdown={(e) => {
    if (e.target === e.currentTarget) close();
  }}
>
  <div
    class="window"
    bind:this={windowEl}
    tabindex="-1"
    role={open ? 'dialog' : undefined}
    aria-modal={open ? 'true' : undefined}
    aria-label={open ? title : undefined}
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

  @media (max-width: 680px) {
    .backdrop {
      align-items: stretch;
      padding: 10px;
      padding-top: calc(10px + env(safe-area-inset-top));
      padding-bottom: calc(10px + env(safe-area-inset-bottom));
    }

    .window {
      width: 100%;
      max-width: 100%;
      max-height: 100%;
      border-radius: var(--r-xl);
    }

    .head {
      padding: 12px 14px;
    }

    .content {
      flex: 1;
    }
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
