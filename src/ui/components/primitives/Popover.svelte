<script lang="ts" module>
  export interface MenuItem {
    value: string;
    label: string;
    color?: string; // var(--rarity-…) for the label text
    selected?: boolean;
    disabled?: boolean;
    meta?: string; // small right-aligned text
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    items,
    onSelect,
    trigger,
    open = $bindable(false),
    onOpenChange,
    align = 'start',
    label = 'Menu',
  }: {
    items: MenuItem[];
    onSelect: (value: string) => void;
    trigger: Snippet<[{ toggle: () => void; open: boolean }]>;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    align?: 'start' | 'end' | 'stretch';
    label?: string;
  } = $props();

  let root: HTMLElement;
  let panel = $state<HTMLElement | null>(null);

  function setOpen(v: boolean) {
    if (v === open) return;
    open = v;
    onOpenChange?.(v);
  }
  function toggle() {
    setOpen(!open);
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) setOpen(false);
  }
  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    const btns = panel
      ? Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
      : [];
    if (!btns.length) return;
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      btns[(idx + 1) % btns.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      btns[(idx - 1 + btns.length) % btns.length]?.focus();
    }
  }

  // Focus the selected (or first enabled) item when the menu opens.
  $effect(() => {
    if (open && panel) {
      const target =
        panel.querySelector<HTMLButtonElement>('button[aria-current="true"]') ??
        panel.querySelector<HTMLButtonElement>('button:not([disabled])');
      target?.focus();
    }
  });

  function choose(item: MenuItem) {
    if (item.disabled) return;
    onSelect(item.value);
    setOpen(false);
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onKeydown} />

<div class="pop" bind:this={root}>
  {@render trigger({ toggle, open })}
  {#if open}
    <div
      class="panel"
      class:end={align === 'end'}
      class:stretch={align === 'stretch'}
      bind:this={panel}
      role="menu"
      aria-label={label}
    >
      {#each items as item (item.value)}
        <button
          class="item"
          role="menuitem"
          disabled={item.disabled}
          aria-current={item.selected ? 'true' : undefined}
          onclick={() => choose(item)}
          style:color={item.color ?? 'var(--text)'}
        >
          <span class="lbl">{item.label}</span>
          {#if item.meta}<span class="meta">{item.meta}</span>{/if}
          {#if item.selected}<span class="check" aria-hidden="true">✓</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pop {
    position: relative;
  }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 40;
    min-width: 220px;
    max-height: 280px;
    overflow-y: auto;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--surface-popover);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border-popover);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-pop);
    animation: pop-in var(--dur-fast) var(--ease-spring);
    transform-origin: top left;
  }
  .panel.end {
    left: auto;
    right: 0;
    transform-origin: top right;
  }
  .panel.stretch {
    left: 0;
    right: 0;
    min-width: 0;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 9px;
    border: none;
    border-radius: var(--r-md);
    background: transparent;
    text-align: left;
    cursor: pointer;
    font: 500 var(--fs-body) var(--font-ui);
    transition: background var(--dur-fast) var(--ease);
  }
  .item:hover:not(:disabled),
  .item:focus-visible {
    background: var(--surface-card);
    outline: none;
  }
  .item:disabled {
    color: var(--text-faint) !important;
    cursor: default;
  }
  .lbl {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    font: 500 var(--fs-xs) var(--font-display);
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .check {
    color: var(--accent);
    font-size: 11px;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: scale(0.96) translateY(-2px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
