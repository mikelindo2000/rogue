<script lang="ts">
  import { tick } from 'svelte';
  import { ui, actions, type InventoryCell, type EquipSlotView } from '../store.svelte';
  import type { EquipSlot, InventoryAction, InventoryRef } from '../../types';
  import Modal from './primitives/Modal.svelte';
  import Icon from './primitives/Icon.svelte';
  import RarityDot from './primitives/RarityDot.svelte';
  import DurabilityBar from './primitives/DurabilityBar.svelte';
  import UpgradeBadge from './primitives/UpgradeBadge.svelte';
  import InventoryComparePanel from './InventoryComparePanel.svelte';

  // The loadout hub is a three-column, keyboard-first screen:
  //   spine (equip slots + pack categories) | candidates | detail/compare.
  // Focus drives selection — arrowing a column live-updates the column to its
  // right — so Left/Right (or Tab) hop columns and Enter acts on the highlight.

  type Group =
    | { key: string; kind: 'slot'; label: string; icon: EquipSlotView['icon']; slotView: EquipSlotView }
    | { key: string; kind: 'cat'; label: string; icon: InventoryCell['icon']; catKind: InventoryRef['kind']; count: number };

  type Entry =
    | { key: string; kind: 'equipped'; view: EquipSlotView }
    | { key: string; kind: 'cell'; cell: InventoryCell };

  const CAT_ORDER: { kind: InventoryRef['kind']; label: string }[] = [
    { kind: 'potion', label: 'Potions' },
    { kind: 'scroll', label: 'Scrolls' },
    { kind: 'wand', label: 'Wands' },
    { kind: 'food', label: 'Food' },
  ];

  let spineEl = $state<HTMLElement | null>(null);
  let listEl = $state<HTMLElement | null>(null);
  let detailEl = $state<HTMLElement | null>(null);

  let activeKey = $state<string>('');
  let selectedKey = $state<string>('');

  function refKey(ref: InventoryRef): string {
    if (ref.kind === 'food') return 'food';
    if (ref.kind === 'potion') return `potion:${ref.potionType}`;
    if (ref.kind === 'scroll') return `scroll:${ref.scrollType}`;
    if (ref.kind === 'weapon') return `weapon:${ref.index}`;
    if (ref.kind === 'wand') return `wand:${ref.index}`;
    if (ref.kind === 'shield') return `shield:${ref.index}`;
    return `armor:${ref.slot}:${ref.index}`;
  }

  /** Which equip slot a gear cell belongs under in the spine. */
  function cellSlot(cell: InventoryCell): EquipSlot | null {
    const r = cell.ref;
    if (r.kind === 'weapon') return 'mainHand';
    if (r.kind === 'shield') return 'offHand';
    if (r.kind === 'armor') return r.slot;
    return null;
  }

  const groups = $derived.by<Group[]>(() => {
    const slotGroups: Group[] = ui.equipment.map((s) => ({
      key: `slot:${s.slot}`,
      kind: 'slot',
      label: s.label,
      icon: s.icon,
      slotView: s,
    }));
    const catGroups: Group[] = [];
    for (const { kind, label } of CAT_ORDER) {
      const items = ui.inventoryItems.filter((c) => c.ref.kind === kind);
      if (items.length > 0) {
        catGroups.push({ key: `cat:${kind}`, kind: 'cat', label, icon: items[0].icon, catKind: kind, count: items.length });
      }
    }
    return [...slotGroups, ...catGroups];
  });

  const activeGroup = $derived(groups.find((g) => g.key === activeKey) ?? groups[0]);

  const entries = $derived.by<Entry[]>(() => {
    const g = activeGroup;
    if (!g) return [];
    if (g.kind === 'cat') {
      return ui.inventoryItems
        .filter((c) => c.ref.kind === g.catKind)
        .map((c) => ({ key: refKey(c.ref), kind: 'cell', cell: c }));
    }
    const candidates = ui.inventoryItems
      .filter((c) => cellSlot(c) === g.slotView.slot)
      .map<Entry>((c) => ({ key: refKey(c.ref), kind: 'cell', cell: c }));
    return [{ key: `eq:${g.slotView.slot}`, kind: 'equipped', view: g.slotView }, ...candidates];
  });

  const selected = $derived(entries.find((e) => e.key === selectedKey) ?? entries[0]);

  // Custom generated art for the highlighted item — shown as the detail-pane
  // backdrop, the same treatment the previous modal used.
  const selectedArt = $derived(
    selected?.kind === 'cell' ? selected.cell.artUrl : selected?.kind === 'equipped' ? selected.view.artUrl : ''
  );

  function groupKeyForRef(ref: InventoryRef): string {
    if (ref.kind === 'weapon') return 'slot:mainHand';
    if (ref.kind === 'shield') return 'slot:offHand';
    if (ref.kind === 'armor') return `slot:${ref.slot}`;
    return `cat:${ref.kind}`;
  }

  function close() {
    actions.setInventoryOpen(false);
  }

  // ---- Selection / actions -------------------------------------------------

  function selectGroup(key: string) {
    if (activeKey === key) return;
    activeKey = key;
    selectedKey = '';
    // Default the candidate highlight to the first real candidate, else the
    // equipped row (so the detail pane always has something to show). `entries`
    // recomputes after activeKey settles, hence the tick.
    tick().then(() => {
      const first = entries.find((e) => e.kind === 'cell') ?? entries[0];
      selectedKey = first?.key ?? '';
    });
  }

  function defaultAction(cell: InventoryCell): InventoryAction | null {
    return cell.actions.find((a) => !a.disabled)?.action ?? null;
  }

  // Dispatch an action, then re-anchor keyboard focus into the candidate column.
  // Equipping/dropping removes the acted-on row, which would otherwise drop focus
  // to <body> and kill arrow/Tab nav (the handler's containment guard fails).
  function runAction(ref: InventoryRef, action: InventoryAction) {
    actions.inventoryAction(ref, action);
    tick().then(() => focusColumn(1));
  }

  function runDefault(cell: InventoryCell) {
    const action = defaultAction(cell);
    if (action) runAction(cell.ref, action);
  }

  function runVerb(cell: InventoryCell, predicate: (a: InventoryAction) => boolean) {
    const action = cell.actions.find((a) => !a.disabled && predicate(a.action));
    if (action) runAction(cell.ref, action.action);
  }

  // ---- Focus / keyboard ----------------------------------------------------

  function navButtons(container: HTMLElement | null): HTMLButtonElement[] {
    return container ? Array.from(container.querySelectorAll<HTMLButtonElement>('[data-nav]:not([disabled])')) : [];
  }

  function activeColumnIndex(): number {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return -1;
    if (spineEl?.contains(el)) return 0;
    if (listEl?.contains(el)) return 1;
    if (detailEl?.contains(el)) return 2;
    return -1;
  }

  // Selection is driven explicitly here rather than via onfocus, because
  // programmatic .focus() doesn't reliably fire focus events (e.g. when the
  // document isn't focused), which would desync the highlight from the cursor.
  function applySelection(button: HTMLButtonElement, colIdx: number) {
    const key = button.dataset.nav;
    if (!key) return;
    if (colIdx === 0) selectGroup(key);
    else if (colIdx === 1) selectedKey = key;
  }

  function focusColumn(index: number) {
    const cols = [spineEl, listEl, detailEl];
    const target = cols[index];
    if (!target) return;
    const buttons = navButtons(target);
    if (buttons.length === 0) {
      // Nothing focusable here (e.g. empty detail) — skip onward.
      if (index < 2) focusColumn(index + 1);
      return;
    }
    // Prefer the already-selected row in the list column.
    const selectedBtn = buttons.find((b) => b.dataset.nav === selectedKey) ?? buttons.find((b) => b.dataset.nav === activeKey);
    const btn = selectedBtn ?? buttons[0];
    btn.focus();
    applySelection(btn, index);
  }

  function moveWithin(dir: number) {
    const colIdx = activeColumnIndex();
    if (colIdx < 0) return;
    const container = [spineEl, listEl, detailEl][colIdx];
    const buttons = navButtons(container);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? 0 : (current + dir + buttons.length) % buttons.length;
    const btn = buttons[next];
    if (!btn) return;
    btn.focus();
    applySelection(btn, colIdx);
  }

  // `handle` claims the event for the hub: prevents the browser default and stops
  // it reaching the other window listeners (Modal's Tab focus-trap, the global
  // game KeyboardManager). Escape and the toggle key 'c' are deliberately left
  // unclaimed so Modal close / KeyboardManager toggle still work.
  function handle(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleKeyboard(event: KeyboardEvent) {
    if (!ui.inventoryOpen) return;
    const target = event.target as HTMLElement | null;
    const bodyEl = spineEl?.closest('.body');
    if (!target || !bodyEl?.contains(target)) return;

    const colIdx = activeColumnIndex();

    switch (event.key) {
      case 'ArrowDown':
        handle(event);
        moveWithin(1);
        break;
      case 'ArrowUp':
        handle(event);
        moveWithin(-1);
        break;
      case 'ArrowRight':
        handle(event);
        focusColumn(Math.min(2, colIdx + 1));
        break;
      case 'Tab':
        handle(event);
        focusColumn(event.shiftKey ? Math.max(0, colIdx - 1) : Math.min(2, colIdx + 1));
        break;
      case 'ArrowLeft':
        handle(event);
        focusColumn(Math.max(0, colIdx - 1));
        break;
      case 'Enter':
        handle(event);
        if (colIdx === 0) {
          focusColumn(1);
        } else if (colIdx === 2 && target instanceof HTMLButtonElement) {
          target.click();
        } else if (selected?.kind === 'cell') {
          runDefault(selected.cell);
        }
        break;
      case 'e':
      case 'E':
        if (selected?.kind === 'cell') {
          handle(event);
          runVerb(selected.cell, (a) => a === 'equip' || a === 'equipOffHand');
        }
        break;
      case 'd':
      case 'D':
        if (selected?.kind === 'cell') {
          handle(event);
          runVerb(selected.cell, (a) => a === 'drop');
        }
        break;
      case 'r':
      case 'R':
        if (selected?.kind === 'cell' && selected.cell.ref.kind === 'scroll') {
          handle(event);
          runDefault(selected.cell);
        }
        break;
    }
  }

  // ---- Initialization on open ---------------------------------------------

  let wasOpen = false;
  $effect(() => {
    if (!ui.inventoryOpen) {
      wasOpen = false;
      return;
    }
    if (wasOpen) return; // only initialize on the open transition
    wasOpen = true;

    let key = groups[0]?.key ?? '';
    if (ui.inventoryFilterKind === 'scroll' && groups.some((g) => g.key === 'cat:scroll')) {
      key = 'cat:scroll';
    } else if (ui.selectedEquipSlot && groups.some((g) => g.key === `slot:${ui.selectedEquipSlot}`)) {
      key = `slot:${ui.selectedEquipSlot}`;
    } else if (ui.selectedInventoryRef) {
      const candidate = groupKeyForRef(ui.selectedInventoryRef);
      if (groups.some((g) => g.key === candidate)) key = candidate;
    }
    activeKey = key;

    tick().then(() => {
      // Highlight the ref the user clicked, the first candidate, else equipped.
      let initial = entries.find((e) => e.kind === 'cell') ?? entries[0];
      if (ui.selectedInventoryRef) {
        const wanted = refKey(ui.selectedInventoryRef);
        initial = entries.find((e) => e.key === wanted) ?? initial;
      }
      selectedKey = initial?.key ?? '';
      tick().then(() => focusColumn(entries.length > 0 ? 1 : 0));
    });
  });

  const title = $derived(ui.inventoryFilterKind === 'scroll' ? 'Scrolls' : 'Loadout');

  // Listen in the capture phase so the hub's nav/verbs win over the Modal's
  // bubble-phase Tab focus-trap and the global KeyboardManager.
  $effect(() => {
    if (!ui.inventoryOpen) return;
    const onKey = (e: KeyboardEvent) => handleKeyboard(e);
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
</script>

<Modal open={ui.inventoryOpen} {title} onClose={close}>
  <div class="body">
    <!-- Column 1: spine -->
    <nav class="spine" bind:this={spineEl} aria-label="Equipment slots and pack">
      {#each groups as g (g.key)}
        {#if g.kind === 'slot'}
          <button
            class="spine-row"
            class:active={activeGroup?.key === g.key}
            data-nav={g.key}
            onclick={() => selectGroup(g.key)}
            aria-current={activeGroup?.key === g.key}
          >
            <span class="spine-icon" style:color={g.slotView.empty ? 'var(--text-faintest)' : (g.slotView.health?.color ?? g.slotView.rarityColor)}>
              <Icon name={g.icon} size={16} />
            </span>
            <span class="spine-text">
              <span class="spine-label">{g.label}</span>
              <span class="spine-name" class:empty={g.slotView.empty} style:color={g.slotView.empty ? undefined : g.slotView.rarityColor}>
                {g.slotView.empty ? (g.slotView.emptyLabel ?? 'Empty') : g.slotView.itemName}
              </span>
            </span>
            {#if g.slotView.upgrade}
              <span class="spine-up" title={g.slotView.upgrade.strict ? 'Strictly better available' : 'Better available'}>{g.slotView.upgrade.strict ? '▲▲' : '▲'}</span>
            {/if}
          </button>
        {:else}
          <button
            class="spine-row"
            class:active={activeGroup?.key === g.key}
            data-nav={g.key}
            onclick={() => selectGroup(g.key)}
            aria-current={activeGroup?.key === g.key}
          >
            <span class="spine-icon"><Icon name={g.icon} size={16} /></span>
            <span class="spine-text">
              <span class="spine-label">Pack</span>
              <span class="spine-name">{g.label}</span>
            </span>
            <span class="spine-count tnum">{g.count}</span>
          </button>
        {/if}
      {/each}
    </nav>

    <!-- Column 2: candidates -->
    <div class="list" bind:this={listEl} aria-label="Candidates">
      {#if entries.length === 0}
        <div class="empty-col">Nothing here.</div>
      {:else}
        {#each entries as entry (entry.key)}
          {#if entry.kind === 'equipped'}
            <button
              class="row equipped"
              class:selected={selected?.key === entry.key}
              data-nav={entry.key}
              onclick={() => (selectedKey = entry.key)}
            >
              <span class="tile" class:broken={entry.view.health?.tone === 'broken'} style:color={entry.view.health?.color ?? entry.view.rarityColor}>
                <Icon name={entry.view.icon} size={18} />
              </span>
              <span class="row-text">
                <span class="row-top">
                  <span class="name" style:color={entry.view.empty ? 'var(--text-faint)' : entry.view.rarityColor}>
                    {entry.view.empty ? (entry.view.emptyLabel ?? 'Empty') : entry.view.itemName}
                  </span>
                  <span class="tag">Equipped</span>
                </span>
                {#if entry.view.health}<DurabilityBar health={entry.view.health} />{/if}
              </span>
              <span class="row-stat tnum">{entry.view.statLabel}</span>
            </button>
          {:else}
            <button
              class="row"
              class:selected={selected?.key === entry.key}
              data-nav={entry.key}
              onclick={() => (selectedKey = entry.key)}
              aria-label="{entry.cell.label}{entry.cell.statLabel ? `, ${entry.cell.statLabel}` : ''}{entry.cell.health ? `, condition ${entry.cell.health.tone}` : ''}{entry.cell.strictlyBetter ? ', strictly better' : entry.cell.verdict ? `, ${entry.cell.verdict}` : ''}"
            >
              <span class="tile" class:broken={entry.cell.health?.tone === 'broken'} style:color={entry.cell.health?.color ?? entry.cell.rarityColor}>
                <Icon name={entry.cell.icon} size={18} />
                {#if entry.cell.count}<span class="count">{entry.cell.count}</span>{/if}
              </span>
              <span class="row-text">
                <span class="row-top">
                  <span class="name" style:color={entry.cell.rarityColor}>{entry.cell.label}</span>
                  <UpgradeBadge verdict={entry.cell.verdict} strictlyBetter={entry.cell.strictlyBetter} isBest={entry.cell.isBest} />
                </span>
                {#if entry.cell.health}<DurabilityBar health={entry.cell.health} />{:else}<span class="row-detail">{entry.cell.detail}</span>{/if}
              </span>
              {#if entry.cell.statLabel}<span class="row-stat tnum">{entry.cell.statLabel}</span>{/if}
              <RarityDot color={entry.cell.rarityColor} glow />
            </button>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Column 3: detail / comparison -->
    <section
      class="detail"
      class:has-art={!!selectedArt}
      bind:this={detailEl}
      aria-label="Details"
      style={selectedArt ? `--item-art: url("${selectedArt}")` : undefined}
    >
      {#if selected?.kind === 'equipped'}
        <div class="hero">
          <span class="hero-icon" style:color={selected.view.health?.color ?? selected.view.rarityColor}>
            <Icon name={selected.view.icon} size={26} stroke={1.35} />
          </span>
          <div class="hero-text">
            <h3 style:color={selected.view.rarityColor}>
              <span>{selected.view.empty ? (selected.view.emptyLabel ?? 'Empty') : selected.view.itemName}</span>
              <em class="tnum">{selected.view.statLabel}</em>
            </h3>
            <p>Currently equipped in your {selected.view.label.toLowerCase()} slot.{selected.view.upgrade ? ` A better option is in your pack.` : ''}</p>
          </div>
        </div>
        {#if selected.view.health}
          <div class="dura-row"><DurabilityBar health={selected.view.health} width="160px" /><span class="tnum">{selected.view.health.label}</span></div>
        {/if}
        <p class="hint">Highlight a candidate on the left to compare and equip.</p>
      {:else if selected?.kind === 'cell'}
        {@const cell = selected.cell}
        <div class="hero">
          <span class="hero-icon" class:broken={cell.health?.tone === 'broken'} style:color={cell.health?.color ?? cell.rarityColor}>
            <Icon name={cell.icon} size={26} stroke={1.35} />
            {#if cell.count}<span class="hero-count">{cell.count}</span>{/if}
          </span>
          <div class="hero-text">
            <h3 style:color={cell.rarityColor}>
              <span>{cell.label}</span>
              {#if cell.statLabel}<em class="tnum">{cell.statLabel}</em>{/if}
            </h3>
            <p>{cell.detail}</p>
            <UpgradeBadge verdict={cell.verdict} strictlyBetter={cell.strictlyBetter} isBest={cell.isBest} />
          </div>
        </div>

        {#if cell.health}
          <div class="dura-row"><DurabilityBar health={cell.health} width="160px" /><span class="tnum">{cell.health.label}</span></div>
        {/if}

        <div class="actions">
          {#each cell.actions as item (item.action)}
            <button
              class="action"
              data-nav={`act:${item.action}`}
              disabled={item.disabled}
              title={item.reason}
              onclick={() => { if (!item.disabled) runAction(cell.ref, item.action); }}
            >
              {item.label}
            </button>
          {/each}
        </div>

        {#if cell.comparisons?.length}
          <InventoryComparePanel {cell} />
        {/if}
      {:else}
        <div class="empty-col">Select an item.</div>
      {/if}
    </section>
  </div>
</Modal>

<style>
  .body {
    display: grid;
    grid-template-columns: minmax(190px, 220px) minmax(280px, 360px) minmax(250px, 300px);
    width: min(84vw, 1000px);
    max-width: 100%;
    box-sizing: border-box;
    min-height: 440px;
    max-height: 72vh;
  }

  .spine {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 10px 8px;
    overflow: auto;
    border-right: 1px solid var(--border);
    background: var(--surface-rail);
  }
  .spine-row {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 7px 8px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .spine-row:hover,
  .spine-row.active {
    background: var(--surface-card);
    border-color: var(--border-slot);
  }
  .spine-row:focus-visible {
    outline: none;
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 35%, transparent);
  }
  .spine-icon {
    display: inline-flex;
    flex: none;
  }
  .spine-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .spine-label {
    font: 600 var(--fs-micro) var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--text-dimmer);
  }
  .spine-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 600 var(--fs-xs) var(--font-ui);
  }
  .spine-name.empty {
    color: var(--text-faint);
    font-weight: 500;
  }
  .spine-up {
    flex: none;
    color: var(--good-bright);
    font: 750 11px var(--font-display);
  }
  .spine-count {
    flex: none;
    padding: 1px 6px;
    border-radius: var(--r-pill);
    border: 1px solid var(--border-chip);
    background: var(--surface-inset);
    color: var(--text-muted);
    font: 700 10px var(--font-display);
    font-variant-numeric: tabular-nums;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px;
    overflow: auto;
    border-right: 1px solid var(--border);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .row:hover,
  .row.selected {
    background: var(--surface-card);
    border-color: var(--border-slot);
  }
  .row:focus-visible {
    outline: none;
    border-color: var(--focus-ring);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 35%, transparent);
  }
  .row.equipped {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .tile {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: var(--r-md);
    background: var(--surface-inset-2);
    border: 1px solid color-mix(in srgb, currentColor 45%, var(--border-slot));
  }
  .tile.broken {
    opacity: 0.74;
    filter: saturate(0.55);
  }
  .count {
    position: absolute;
    right: 3px;
    bottom: 2px;
    font: 700 9px var(--font-display);
    color: var(--text-label);
  }
  .row-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row-top {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 650 var(--fs-body) var(--font-ui);
  }
  .row-detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 500 var(--fs-xs) var(--font-ui);
    color: var(--text-dim);
  }
  .tag {
    flex: none;
    padding: 1px 6px;
    border-radius: var(--r-pill);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border-chip));
    background: var(--accent-surface);
    color: var(--accent);
    font: 700 8.5px var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }
  .row-stat {
    flex: none;
    padding: 2px 6px;
    border: 1px solid var(--border-chip);
    border-radius: var(--r-pill);
    background: var(--surface-inset);
    color: var(--text-label);
    font: 750 var(--fs-micro) var(--font-display);
    font-variant-numeric: tabular-nums;
  }

  .detail {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    overflow: auto;
    background: var(--surface-app);
  }
  /* Custom generated item art fills the whole pane (cropping is fine). No scrim;
     text legibility comes from per-element shadows below. */
  .detail.has-art::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    background: var(--item-art) center / cover no-repeat;
    filter: saturate(1.05) contrast(1.05);
    pointer-events: none;
  }
  .detail > * {
    position: relative;
    z-index: 2;
  }
  /* Keep text readable over the art without darkening the panel. */
  .detail.has-art h3,
  .detail.has-art p,
  .detail.has-art .dura-row {
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 2px rgba(0, 0, 0, 0.7);
  }
  .hero {
    display: flex;
    gap: 13px;
    align-items: flex-start;
  }
  .hero-icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 54px;
    height: 54px;
    flex: none;
    border-radius: var(--r-lg);
    background: var(--surface-inset-2);
    border: 1px solid color-mix(in srgb, currentColor 45%, var(--border-slot));
  }
  .hero-icon.broken {
    opacity: 0.74;
    filter: saturate(0.55);
  }
  .hero-count {
    position: absolute;
    right: 4px;
    bottom: 3px;
    font: 700 10px var(--font-display);
    color: var(--text-label);
  }
  .hero-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin: 0;
    font: 700 17px var(--font-display);
  }
  h3 em {
    color: var(--accent);
    font: 750 var(--fs-body) var(--font-display);
    font-style: normal;
  }
  .detail p {
    margin: 0;
    color: var(--text-muted);
    font: 500 var(--fs-body)/1.45 var(--font-ui);
  }
  .hint {
    color: var(--text-dim) !important;
    font-size: var(--fs-xs) !important;
  }
  .dura-row {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-label);
    font: 700 var(--fs-xs) var(--font-display);
    font-variant-numeric: tabular-nums;
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

  .empty-col {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    color: var(--text-dim);
    font: 500 var(--fs-body) var(--font-ui);
  }

  @media (max-width: 1040px) {
    .body {
      grid-template-columns: 1fr;
      width: min(100%, 460px);
      max-height: none;
    }
    .spine {
      flex-direction: row;
      flex-wrap: wrap;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
    .spine-row {
      width: auto;
    }
    .list {
      border-right: none;
      border-bottom: 1px solid var(--border);
      max-height: 36vh;
    }
  }
</style>
