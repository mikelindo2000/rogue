<script lang="ts">
  import Modal from './primitives/Modal.svelte';
  import KeyCap from './primitives/KeyCap.svelte';
  import { ui, actions } from '../store.svelte';
  import { formatKeyLabel, type ShortcutInfo } from '../../keyboard';

  // Human labels + display order for the contexts the registry uses. Anything
  // not listed here still renders, appended under its raw context name.
  const GROUPS: Array<{ context: string; label: string }> = [
    { context: 'game', label: 'In the dungeon' },
    { context: 'aiming', label: 'Aiming a wand' },
  ];

  function close() {
    actions.setShortcutsOpen(false);
  }

  const grouped = $derived.by(() => {
    const byContext = new Map<string, ShortcutInfo[]>();
    for (const s of ui.shortcuts) {
      const list = byContext.get(s.context) ?? [];
      list.push(s);
      byContext.set(s.context, list);
    }
    const ordered: Array<{ label: string; items: ShortcutInfo[] }> = [];
    for (const g of GROUPS) {
      const items = byContext.get(g.context);
      if (items?.length) ordered.push({ label: g.label, items });
      byContext.delete(g.context);
    }
    for (const [context, items] of byContext) {
      if (items.length) ordered.push({ label: context, items });
    }
    return ordered;
  });
</script>

<Modal open={ui.shortcutsOpen} title="Keyboard shortcuts" onClose={close}>
  <div class="shortcuts">
    {#each grouped as group (group.label)}
      <section class="group">
        <h3 class="group-label">{group.label}</h3>
        <ul class="rows">
          {#each group.items as s}
            <li class="row">
              <span class="keys">
                {#if s.ctrlOrMeta}<KeyCap>⌘/Ctrl</KeyCap>{/if}
                {#each s.keys as k}<KeyCap>{formatKeyLabel(k)}</KeyCap>{/each}
              </span>
              <span class="desc">{s.description}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
    <p class="foot">Press <KeyCap>?</KeyCap> any time to open this list.</p>
  </div>
</Modal>

<style>
  .shortcuts {
    width: min(92vw, 520px);
    padding: 18px 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group-label {
    margin: 0;
    font: 700 9px var(--font-display);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-label);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 7px 0;
    border-top: 1px solid var(--border-subtle);
  }
  .row:first-child {
    border-top: none;
  }
  .keys {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    min-width: 96px;
  }
  .desc {
    font: 500 var(--fs-sm) var(--font-ui);
    color: var(--text-muted);
  }
  .foot {
    margin: 0;
    font: 500 var(--fs-xs) var(--font-ui);
    color: var(--text-dim);
  }
</style>
