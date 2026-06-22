<script lang="ts">
  import { ui, actions, type InventoryCell } from '../store.svelte';
  import type { InventoryAction, InventoryRef } from '../../types';
  import Modal from './primitives/Modal.svelte';
  import Icon from './primitives/Icon.svelte';
  import RarityDot from './primitives/RarityDot.svelte';

  function refKey(ref: InventoryRef): string {
    if (ref.kind === 'food') return 'food';
    if (ref.kind === 'potion') return `potion:${ref.potionType}`;
    if (ref.kind === 'weapon') return `weapon:${ref.index}`;
    if (ref.kind === 'shield') return `shield:${ref.index}`;
    return `armor:${ref.slot}:${ref.index}`;
  }

  const selected = $derived.by<InventoryCell | undefined>(() => {
    const selectedRef = ui.selectedInventoryRef;
    if (!selectedRef) return ui.inventory[0];
    return ui.inventory.find((cell) => refKey(cell.ref) === refKey(selectedRef)) ?? ui.inventory[0];
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
</script>

<Modal open={ui.inventoryOpen} title="Inventory" onClose={close}>
  <div class="body">
    {#if ui.inventory.length === 0}
      <div class="empty">
        <div class="empty-icon"><Icon name="pouch" size={28} /></div>
        <p>Your pack is empty.</p>
      </div>
    {:else}
      <div class="list" aria-label="Carried items">
        {#each ui.inventory as cell (refKey(cell.ref))}
          <button
            class="row"
            class:selected={selected && refKey(selected.ref) === refKey(cell.ref)}
            onclick={() => choose(cell)}
            aria-pressed={selected && refKey(selected.ref) === refKey(cell.ref)}
          >
            <span class="tile" style:color={cell.rarityColor}>
              <Icon name={cell.icon} size={18} />
              {#if cell.count}<span class="count">{cell.count}</span>{/if}
            </span>
            <span class="row-text">
              <span class="name" style:color={cell.rarityColor}>{cell.label}</span>
              <span class="detail">{cell.detail}</span>
            </span>
            <RarityDot color={cell.rarityColor} glow />
          </button>
        {/each}
      </div>

      {#if selected}
        <section class="detail-pane" aria-label="Selected item">
          <div class="hero">
            <span class="hero-icon" style:color={selected.rarityColor}>
              <Icon name={selected.icon} size={28} stroke={1.35} />
              {#if selected.count}<span class="hero-count">{selected.count}</span>{/if}
            </span>
            <div class="hero-text">
              <h3 style:color={selected.rarityColor}>{selected.label}</h3>
              <p>{selected.detail}</p>
            </div>
          </div>

          <div class="actions">
            {#each selected.actions as item (item.action)}
              <button
                class="action"
                disabled={item.disabled}
                title={item.reason}
                onclick={() => run(selected, item.action)}
              >
                {item.label}
              </button>
            {/each}
          </div>

          {#if selected.actions.some((item) => item.disabled && item.reason)}
            <div class="reasons">
              {#each selected.actions.filter((item) => item.disabled && item.reason) as item (item.action)}
                <p>{item.reason}</p>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    {/if}
  </div>
</Modal>

<style>
  .body {
    display: grid;
    grid-template-columns: minmax(260px, 340px) minmax(300px, 420px);
    gap: 0;
    width: min(82vw, 760px);
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

  .row-text {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
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

  .detail-pane {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px;
    background: var(--surface-app);
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
    margin: 0 0 6px;
    font: 700 18px var(--font-display);
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

  .action:hover:not(:disabled),
  .action:focus-visible {
    background: var(--accent-log-surface);
    border-color: var(--accent);
    outline: none;
  }

  .action:disabled {
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

  @media (max-width: 720px) {
    .body {
      grid-template-columns: 1fr;
      width: min(92vw, 460px);
    }

    .list {
      max-height: 36vh;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }
</style>
