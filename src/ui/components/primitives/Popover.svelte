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

  type Placement = 'top' | 'bottom';

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
  let placement = $state<Placement>('bottom');
  let panelStyle = $state('');
  let restoreTarget: HTMLElement | null = null;

  const VIEWPORT_PAD = 10;
  const PANEL_GAP = 6;
  const PANEL_MIN_WIDTH = 220;
  const PANEL_MAX_HEIGHT = 280;

  function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function triggerElement() {
    return root?.querySelector<HTMLElement>('[aria-haspopup="menu"]') ?? root;
  }

  function setOpen(v: boolean, opts: { restoreFocus?: boolean } = {}) {
    if (v === open) return;
    if (v) {
      const active = document.activeElement;
      restoreTarget = active instanceof HTMLElement && root?.contains(active) ? active : triggerElement();
    }
    open = v;
    onOpenChange?.(v);
    if (!v && opts.restoreFocus) {
      queueMicrotask(() => restoreTarget?.focus());
    }
  }

  function toggle() {
    setOpen(!open, { restoreFocus: open });
  }

  function updatePosition() {
    if (!open || !root || !panel) return;

    const anchor = root.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const availableW = Math.max(0, viewportW - VIEWPORT_PAD * 2);
    const desiredW =
      align === 'stretch'
        ? Math.max(anchor.width, PANEL_MIN_WIDTH)
        : Math.max(panel.scrollWidth, PANEL_MIN_WIDTH);
    const width = Math.min(desiredW, availableW);

    let left = align === 'end' ? anchor.right - width : anchor.left;
    left = clamp(left, VIEWPORT_PAD, viewportW - VIEWPORT_PAD - width);

    const spaceBelow = viewportH - anchor.bottom - PANEL_GAP - VIEWPORT_PAD;
    const spaceAbove = anchor.top - PANEL_GAP - VIEWPORT_PAD;
    const naturalH = Math.min(panel.scrollHeight, PANEL_MAX_HEIGHT);
    const nextPlacement: Placement = spaceBelow >= naturalH || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    const viewportMaxH = Math.max(0, viewportH - VIEWPORT_PAD * 2);
    const preferredH = Math.max(64, nextPlacement === 'bottom' ? spaceBelow : spaceAbove);
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, preferredH, viewportMaxH);
    const panelHeight = Math.min(panel.scrollHeight, maxHeight);
    const top =
      nextPlacement === 'bottom'
        ? clamp(anchor.bottom + PANEL_GAP, VIEWPORT_PAD, viewportH - VIEWPORT_PAD - panelHeight)
        : clamp(anchor.top - PANEL_GAP - panelHeight, VIEWPORT_PAD, viewportH - VIEWPORT_PAD - panelHeight);

    placement = nextPlacement;
    panelStyle = `left:${left}px;top:${top}px;width:${width}px;max-height:${maxHeight}px;`;
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) setOpen(false);
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false, { restoreFocus: true });
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

  $effect(() => {
    if (!open || !panel) return;

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  });

  function choose(item: MenuItem) {
    if (item.disabled) return;
    onSelect(item.value);
    setOpen(false, { restoreFocus: true });
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
      class:above={placement === 'top'}
      style={panelStyle}
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
    position: fixed;
    z-index: 40;
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
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }
  .panel.end {
    transform-origin: top right;
  }
  .panel.stretch {
    transform-origin: top left;
  }
  .panel.above {
    transform-origin: bottom left;
  }
  .panel.end.above {
    transform-origin: bottom right;
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
