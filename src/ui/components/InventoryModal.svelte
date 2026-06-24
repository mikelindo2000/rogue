<script lang="ts">
  import { tick } from 'svelte';
  import { ui, actions, type InventoryCell } from '../store.svelte';
  import type { InventoryAction, InventoryRef } from '../../types';
  import Modal from './primitives/Modal.svelte';
  import Icon from './primitives/Icon.svelte';
  import RarityDot from './primitives/RarityDot.svelte';
  import InventoryComparePanel from './InventoryComparePanel.svelte';

  let listEl = $state<HTMLElement | null>(null);
  let bodyEl = $state<HTMLElement | null>(null);

  function refKey(ref: InventoryRef): string {
    if (ref.kind === 'food') return 'food';
    if (ref.kind === 'potion') return `potion:${ref.potionType}`;
    if (ref.kind === 'scroll') return `scroll:${ref.scrollType}`;
    if (ref.kind === 'weapon') return `weapon:${ref.index}`;
    if (ref.kind === 'wand') return `wand:${ref.index}`;
    if (ref.kind === 'shield') return `shield:${ref.index}`;
    return `armor:${ref.slot}:${ref.index}`;
  }

  const visibleItems = $derived.by<InventoryCell[]>(() => {
    if (ui.inventoryFilterKind === 'scroll') {
      return ui.inventoryItems.filter((cell) => cell.ref.kind === 'scroll');
    }
    return ui.inventoryItems;
  });

  const selected = $derived.by<InventoryCell | undefined>(() => {
    const items = visibleItems;
    const selectedRef = ui.selectedInventoryRef;
    if (!selectedRef) return items[0];
    return items.find((cell) => refKey(cell.ref) === refKey(selectedRef)) ?? items[0];
  });

  function close() {
    actions.setInventoryOpen(false);
  }

  function choose(cell: InventoryCell) {
    actions.selectInventoryItem(cell.ref);
  }

  function run(cell: InventoryCell, action: InventoryAction) {
    actions.inventoryAction(cell.ref, action);
  }

  function selectedIndex() {
    if (!selected) return -1;
    return visibleItems.findIndex((cell) => refKey(cell.ref) === refKey(selected.ref));
  }

  function rowFor(cell: InventoryCell | undefined) {
    if (!cell) return null;
    return listEl?.querySelector<HTMLButtonElement>(`button[data-ref="${refKey(cell.ref)}"]`) ?? null;
  }

  function enabledActions() {
    if (!bodyEl) return [];
    return Array.from(bodyEl.querySelectorAll<HTMLButtonElement>('.detail-pane .action:not([aria-disabled="true"])'));
  }

  function moveSelection(delta: number, focusAction = false) {
    if (visibleItems.length === 0) return;
    const currentIndex = selectedIndex();
    const index = currentIndex === -1 ? 0 : currentIndex;
    const next = visibleItems[(index + delta + visibleItems.length) % visibleItems.length];
    if (!next) return;
    choose(next);
    setTimeout(() => {
      if (focusAction) {
        enabledActions()[0]?.focus();
      } else {
        rowFor(next)?.focus();
      }
    });
  }

  function focusSelectedRow() {
    setTimeout(() => rowFor(selected)?.focus());
  }

  function runDefaultAction() {
    if (!selected) return;
    const action = selected.actions.find((item) => !item.disabled);
    if (action) run(selected, action.action);
  }

  function runEquipAction() {
    if (!selected) return;
    const action = selected.actions.find((item) => !item.disabled && item.action.startsWith('equip'));
    if (action) run(selected, action.action);
  }

  function runDropAction() {
    if (!selected) return;
    const action = selected.actions.find((item) => !item.disabled && item.action === 'drop');
    if (action) run(selected, action.action);
  }

  function focusAction(delta: number) {
    const buttons = enabledActions();
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  }

  function handleKeyboard(event: KeyboardEvent) {
    if (!ui.inventoryOpen || visibleItems.length === 0) return;

    const target = event.target as HTMLElement | null;
    if (!target || !bodyEl?.contains(target)) return;

    const onAction = !!target?.closest('.detail-pane .action');

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1, onAction);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1, onAction);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (onAction) {
        focusSelectedRow();
      } else {
        moveSelection(-1);
      }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (onAction) {
        focusAction(1);
      } else {
        enabledActions()[0]?.focus();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (onAction && target instanceof HTMLButtonElement) {
        target.click();
      } else {
        runDefaultAction();
      }
    } else if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      runEquipAction();
    } else if (event.key.toLowerCase() === 'r' && selected?.ref.kind === 'scroll') {
      // Rogue "read" verb, scoped to the modal: read the selected scroll.
      event.preventDefault();
      runDefaultAction();
    } else if (event.key.toLowerCase() === 'd') {
      // Rogue "drop" verb, scoped to the modal. Drop is never the default action,
      // so Return still triggers the primary verb (read/drink/equip), not drop.
      event.preventDefault();
      runDropAction();
    }
  }

  $effect(() => {
    if (!ui.inventoryOpen || visibleItems.length === 0) return;
    tick().then(() => {
      rowFor(selected)?.focus();
    });
  });
</script>

<svelte:window onkeydown={handleKeyboard} />

<Modal open={ui.inventoryOpen} title={ui.inventoryFilterKind === 'scroll' ? 'Scrolls' : 'Inventory'} onClose={close}>
  <div class="body" bind:this={bodyEl}>
    {#if visibleItems.length === 0}
      <div class="empty">
        <div class="empty-icon"><Icon name="pouch" size={28} /></div>
        <p>{ui.inventoryItems.length === 0 ? 'Your pack is empty.' : 'No scrolls in your pack.'}</p>
      </div>
    {:else}
      <div class="list" aria-label="Carried items" bind:this={listEl}>
        {#each visibleItems as cell (refKey(cell.ref))}
          <button
            class="row"
            class:selected={selected && refKey(selected.ref) === refKey(cell.ref)}
            data-ref={refKey(cell.ref)}
            onclick={() => choose(cell)}
            aria-pressed={selected && refKey(selected.ref) === refKey(cell.ref)}
            aria-label="{cell.label}{cell.statLabel ? `, ${cell.statLabel}` : ''}{cell.health ? `, condition ${cell.health.tone}, ${cell.health.label}` : ''}"
          >
            <span class="tile" class:broken={cell.health?.tone === 'broken'} style:color={cell.health?.color ?? cell.rarityColor}>
              <Icon name={cell.icon} size={18} />
              {#if cell.health && cell.health.tone !== 'good'}<span class="health-mini">{cell.health.label}</span>{/if}
              {#if cell.count}<span class="count">{cell.count}</span>{/if}
            </span>
            <span class="row-text">
              <span class="name" style:color={cell.rarityColor}>{cell.label}</span>
              <span class="detail">{cell.detail}</span>
            </span>
            {#if cell.statLabel}<span class="row-stat tnum">{cell.statLabel}</span>{/if}
            <RarityDot color={cell.rarityColor} glow />
          </button>
        {/each}
      </div>

      {#if selected}
        <section class="detail-pane" aria-label="Selected item" style={`--item-art: url("${selected.artUrl}")`}>
          <div class="hero">
            <span class="hero-icon" class:broken={selected.health?.tone === 'broken'} style:color={selected.health?.color ?? selected.rarityColor}>
              <Icon name={selected.icon} size={28} stroke={1.35} />
              {#if selected.health && selected.health.tone !== 'good'}<span class="health-mini hero-health">{selected.health.label}</span>{/if}
              {#if selected.count}<span class="hero-count">{selected.count}</span>{/if}
            </span>
            <div class="hero-text">
              <h3 style:color={selected.rarityColor}>
                <span>{selected.label}</span>
                {#if selected.statLabel}<em class="tnum">{selected.statLabel}</em>{/if}
              </h3>
              <p>{selected.detail}</p>
            </div>
          </div>

          <div class="actions">
            {#each selected.actions as item (item.action)}
              <button
                class="action"
                aria-disabled={item.disabled ? 'true' : undefined}
                aria-describedby={item.reason ? `inventory-reason-${item.action}` : undefined}
                tabindex={item.disabled ? -1 : 0}
                title={item.reason}
                onclick={() => {
                  if (!item.disabled) run(selected, item.action);
                }}
              >
                {item.label}
              </button>
            {/each}
          </div>

          {#if selected.actions.some((item) => item.disabled && item.reason)}
            <div class="reasons">
              {#each selected.actions.filter((item) => item.disabled && item.reason) as item (item.action)}
                <p id="inventory-reason-{item.action}">{item.reason}</p>
              {/each}
            </div>
          {/if}
        </section>
        <InventoryComparePanel cell={selected} />
      {/if}
    {/if}
  </div>
</Modal>

<style>
  .body {
    display: grid;
    grid-template-columns: minmax(250px, 318px) minmax(300px, 390px) minmax(220px, 260px);
    gap: 0;
    width: min(80vw, 968px);
    max-width: 100%;
    box-sizing: border-box;
    min-height: 420px;
  }

  .list {
    min-height: 0;
    max-height: 66vh;
    overflow: auto;
    padding: 10px;
    border-right: 1px solid var(--border);
    background: var(--surface-rail);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }

  .row:hover,
  .row.selected {
    background: var(--surface-card);
    border-color: var(--border-slot);
  }

  .tile,
  .hero-icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    background: var(--surface-inset-2);
    border: 1px solid color-mix(in srgb, currentColor 45%, var(--border-slot));
    box-shadow: inset 0 0 14px color-mix(in srgb, currentColor 9%, transparent);
  }

  .tile {
    width: 34px;
    height: 34px;
    border-radius: var(--r-md);
  }

  .tile.broken,
  .hero-icon.broken {
    opacity: 0.74;
    filter: saturate(0.55);
  }

  .row-text {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .row-stat {
    flex: none;
    padding: 2px 5px;
    border: 1px solid var(--border-chip);
    border-radius: var(--r-pill);
    background: var(--surface-inset);
    color: var(--text-label);
    font: 750 var(--fs-micro) var(--font-display);
    font-variant-numeric: tabular-nums;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 650 var(--fs-body) var(--font-ui);
  }

  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 500 var(--fs-xs) var(--font-ui);
    color: var(--text-dim);
  }

  .count,
  .hero-count {
    position: absolute;
    right: 4px;
    bottom: 3px;
    font: 700 9px var(--font-display);
    color: var(--text-label);
  }

  .health-mini {
    position: absolute;
    top: 2px;
    right: 2px;
    max-width: calc(100% - 4px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 1px 4px;
    border-radius: var(--r-pill);
    border: 1px solid color-mix(in srgb, currentColor 42%, var(--border-chip));
    background: var(--surface-inset);
    color: currentColor;
    font: 750 8px var(--font-display);
    font-variant-numeric: tabular-nums;
  }

  .hero-health {
    top: 5px;
    right: 5px;
    font-size: 9px;
  }

  .detail-pane {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px;
    background: var(--surface-app);
  }

  .detail-pane::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background: var(--item-art) right 8px center / min(86%, 360px) auto no-repeat;
    opacity: 0.8;
    filter: saturate(1.05) contrast(1.08) brightness(1.12);
    pointer-events: none;
  }

  .detail-pane::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(
      90deg,
      var(--surface-app) 0%,
      color-mix(in srgb, var(--surface-app) 92%, transparent) 42%,
      color-mix(in srgb, var(--surface-app) 44%, transparent) 70%,
      transparent 100%
    );
    pointer-events: none;
  }

  .detail-pane > * {
    position: relative;
    z-index: 2;
  }

  .hero {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .hero-icon {
    width: 58px;
    height: 58px;
    border-radius: var(--r-lg);
  }

  .hero-text {
    min-width: 0;
  }

  h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 6px;
    font: 700 18px var(--font-display);
  }

  h3 span {
    min-width: 0;
  }

  h3 em {
    color: var(--accent);
    font: 750 var(--fs-body) var(--font-display);
    font-style: normal;
  }

  p {
    margin: 0;
    color: var(--text-muted);
    font: 500 var(--fs-body)/1.45 var(--font-ui);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .action {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--accent-border);
    border-radius: var(--r-md);
    background: var(--accent-surface);
    color: var(--text-bright);
    cursor: pointer;
    font: 700 11px var(--font-display);
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }

  .action:hover:not([aria-disabled="true"]),
  .action:focus-visible {
    background: var(--accent-log-surface);
    border-color: var(--accent);
    outline: none;
  }

  .action[aria-disabled="true"] {
    cursor: default;
    border-color: var(--border-slot);
    background: var(--surface-inset);
    color: var(--text-faint);
  }

  .reasons {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 2px;
  }

  .reasons p {
    color: var(--text-dim);
    font-size: var(--fs-xs);
  }

  .empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 360px;
    color: var(--text-dim);
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border: 1px dashed var(--border-slot);
    border-radius: var(--r-lg);
    color: var(--text-faint);
    background: var(--surface-inset);
  }

  @media (max-width: 1040px) {
    .body {
      grid-template-columns: 1fr;
      width: min(100%, 460px);
    }

    .list {
      max-height: 36vh;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }

  @media (max-width: 680px) {
    .body {
      width: 100%;
      min-height: 0;
    }

    .list {
      max-height: 34vh;
      padding: 8px;
    }

    .detail-pane {
      gap: 12px;
      padding: 14px;
    }

    .detail-pane::before {
      background-size: min(70%, 260px) auto;
      opacity: 0.54;
    }

    .hero-icon {
      width: 48px;
      height: 48px;
    }

    h3 {
      font-size: 16px;
    }

    .action {
      flex: 1 1 96px;
    }
  }
</style>
