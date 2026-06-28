// @vitest-environment happy-dom
//
// Component-level harness for the loadout hub (the redesigned inventory modal).
// The game-logic suites run DOM-free under Node; this file opts into happy-dom
// and mounts the real Svelte component so the keyboard verbs, the primary-action
// default, the equip path, and the upgrade badges are exercised end to end
// against the live store wiring rather than a mock of it.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import InventoryModal from './InventoryModal.svelte';
import { ui, actions, type InventoryCell, type EquipSlotView } from '../store.svelte';
import type { InventoryAction, InventoryRef } from '../../types';
import { assetReadinessService, type AssetReadinessRequest } from '../../assets/readiness';

const SCROLL_REF: InventoryRef = { kind: 'scroll', scrollType: 'light' };
const ARMOR_REF: InventoryRef = { kind: 'armor', slot: 'chest', index: 1 };
const SCROLL_ART = '/inventory/scroll-of-light.png';
const ARMOR_ART = '/inventory/platemail.png';

function scrollCell(): InventoryCell {
  return {
    icon: 'scroll-light',
    artUrl: '',
    rarityColor: '#fff',
    label: 'Scroll of Light',
    detail: 'Floods the current dark room with light.',
    ref: SCROLL_REF,
    // Primary verb first, Drop last — mirrors GameUI.inventoryActions().
    actions: [
      { action: 'use', label: 'Read' },
      { action: 'drop', label: 'Drop' },
    ],
  };
}

function chestSlot(): EquipSlotView {
  return {
    slot: 'chest',
    label: 'Chest',
    icon: 'chest',
    itemName: 'Tattered Rags',
    statLabel: 'DEF 1',
    rarityColor: '#fff',
    empty: false,
    artUrl: '',
    availableCount: 1,
    availableLabel: '1 item available to equip',
    hasUpgrade: true,
    options: [],
  };
}

function betterChestCell(): InventoryCell {
  return {
    icon: 'chest',
    artUrl: '',
    rarityColor: '#fff',
    label: 'Platemail',
    detail: 'Chest armor. 8/8 defense.',
    statLabel: 'DEF 8',
    ref: ARMOR_REF,
    verdict: 'upgrade',
    strictlyBetter: true,
    isBest: true,
    actions: [
      { action: 'equip', label: 'Equip chest' },
      { action: 'drop', label: 'Drop' },
    ],
  };
}

function artScrollCell(): InventoryCell {
  return { ...scrollCell(), artUrl: SCROLL_ART };
}

function artChestSlot(): EquipSlotView {
  return { ...chestSlot(), artUrl: '/inventory/tattered-rags.png' };
}

function artBetterChestCell(): InventoryCell {
  return { ...betterChestCell(), artUrl: ARMOR_ART };
}

let host: ReturnType<typeof mount> | null = null;
let inventoryAction: Mock<(ref: InventoryRef, action: InventoryAction) => void>;

function openHub(opts: { items?: InventoryCell[]; equipment?: EquipSlotView[] } = {}) {
  ui.inventoryItems = opts.items ?? [];
  ui.equipment = opts.equipment ?? [];
  ui.inventoryFilterKind = 'all';
  ui.selectedInventoryRef = ui.inventoryItems[0]?.ref ?? null;
  ui.selectedEquipSlot = null;
  ui.inventoryOpen = true;
  host = mount(InventoryModal, { target: document.body });
  flushSync();
}

function listRows(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.list .row'));
}

function candidateRow(): HTMLButtonElement {
  const el = listRows().find((r) => !r.classList.contains('equipped'));
  if (!el) throw new Error('no candidate row rendered');
  return el;
}

function actionButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.detail .action'));
}

beforeEach(() => {
  inventoryAction = vi.fn<(ref: InventoryRef, action: InventoryAction) => void>();
  // The hub calls these store hooks; wire them to mutate the real store the way
  // main.ts does, so derived state (selection, open) behaves authentically.
  actions.inventoryAction = inventoryAction;
  actions.selectInventoryItem = (ref) => { ui.selectedInventoryRef = ref; };
  actions.selectEquipSlot = (slot) => { ui.selectedEquipSlot = slot; };
  actions.setInventoryOpen = (open) => { ui.inventoryOpen = open; };
});

afterEach(() => {
  if (host) { unmount(host); host = null; }
  document.body.innerHTML = '';
  ui.inventoryOpen = false;
  ui.inventoryItems = [];
  ui.equipment = [];
  ui.selectedInventoryRef = null;
  ui.selectedEquipSlot = null;
  vi.restoreAllMocks();
});

describe('loadout hub — pack item verbs', () => {
  it('renders the primary and Drop actions for a carried item', () => {
    openHub({ items: [scrollCell()] });
    const labels = actionButtons().map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Read', 'Drop']);
  });

  it('drops the selected item when Drop is clicked', () => {
    openHub({ items: [scrollCell()] });
    actionButtons().find((b) => b.textContent?.trim() === 'Drop')!.click();
    expect(inventoryAction).toHaveBeenCalledWith(SCROLL_REF, 'drop');
  });

  it('drops the selected item on the "d" mnemonic', () => {
    openHub({ items: [scrollCell()] });
    const row = candidateRow();
    row.focus();
    // Dispatch on the focused row (event.target inside the modal body) so the
    // handler's containment guard passes, mirroring a real bubbled keypress.
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    expect(inventoryAction).toHaveBeenCalledWith(SCROLL_REF, 'drop');
  });

  it('keeps Return bound to the primary verb, never Drop', () => {
    openHub({ items: [scrollCell()] });
    const row = candidateRow();
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(inventoryAction).toHaveBeenCalledWith(SCROLL_REF, 'use');
    expect(inventoryAction).not.toHaveBeenCalledWith(SCROLL_REF, 'drop');
  });

  it('ignores keypresses outside the modal body', () => {
    openHub({ items: [scrollCell()] });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    expect(inventoryAction).not.toHaveBeenCalled();
  });
});

describe('loadout hub — gear', () => {
  it('shows a candidate under its slot with a strictly-better arrow badge', () => {
    openHub({ items: [betterChestCell()], equipment: [chestSlot()] });
    // The chest slot is the only group → auto-selected; the equipped row plus
    // the Platemail candidate render in the list.
    const names = listRows().map((r) => r.querySelector('.name')?.textContent?.trim());
    expect(names).toContain('Platemail');
    // Arrow-only badge: a ▲▲ marker labelled "Strictly better" (no text label).
    const badge = document.querySelector('[aria-label="Strictly better"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('▲▲');
  });

  it('equips the highlighted gear candidate on the "e" mnemonic', () => {
    openHub({ items: [betterChestCell()], equipment: [chestSlot()] });
    const row = candidateRow();
    row.click(); // highlight the candidate (selection follows click / arrow nav)
    flushSync();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    expect(inventoryAction).toHaveBeenCalledWith(ARMOR_REF, 'equip');
  });

  it('keeps keyboard focus inside the hub after an equip removes the row', async () => {
    // Equipping rebuilds the pack without the equipped item; the acted-on row
    // leaves the DOM. The hub must re-anchor focus or arrow/Tab nav goes dead.
    inventoryAction.mockImplementation(() => { ui.inventoryItems = []; });
    openHub({ items: [betterChestCell()], equipment: [chestSlot()] });
    const row = candidateRow();
    row.click();
    flushSync();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    await tick();
    await tick();
    flushSync();
    const active = document.activeElement as HTMLElement;
    expect(active).not.toBe(document.body);
    expect(active.closest('.inv-modal-body')).not.toBeNull();
  });
});

describe('loadout hub — keyboard navigation and focus highlighting', () => {
  it('highlights the initial column selection correctly', async () => {
    // With candidates, Column 1 is focused
    openHub({ items: [scrollCell()] });
    await tick();
    await tick();
    flushSync();
    
    const firstRow = candidateRow();
    expect(firstRow.classList.contains('selected-focus')).toBe(true);
    expect(firstRow.classList.contains('selected-inactive')).toBe(false);

    // Spine has an active group but it is in inactive column (Column 0)
    const spineRow = document.querySelector('.spine-row.active') as HTMLElement;
    expect(spineRow.classList.contains('selected-focus')).toBe(false);
    expect(spineRow.classList.contains('selected-inactive')).toBe(true);
  });

  it('updates selection classes when shifting focus to Column 0', async () => {
    openHub({ items: [scrollCell()] });
    await tick();
    await tick();
    flushSync();

    const firstRow = candidateRow();
    firstRow.focus();
    
    // Press ArrowLeft to focus Column 0
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    await tick();
    flushSync();

    // Now Column 0 is focused
    const spineRow = document.querySelector('.spine-row.active') as HTMLElement;
    expect(spineRow.classList.contains('selected-focus')).toBe(true);
    expect(spineRow.classList.contains('selected-inactive')).toBe(false);

    // Column 1 is inactive
    expect(firstRow.classList.contains('selected-focus')).toBe(false);
    expect(firstRow.classList.contains('selected-inactive')).toBe(true);
  });

  it('navigates to Column 2 (Actions) with ArrowRight and cycles buttons', async () => {
    openHub({ items: [scrollCell()] });
    await tick();
    await tick();
    flushSync();

    const firstRow = candidateRow();
    firstRow.focus();
    
    // Press ArrowRight to focus Column 2
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await tick();
    await tick();
    flushSync();

    // Active element should be the first action button
    const actions = actionButtons();
    expect(document.activeElement).toBe(actions[0]);

    // Press ArrowRight to move to the second action button (Drop)
    actions[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await tick();
    await tick();
    flushSync();
    expect(document.activeElement).toBe(actions[1]);

    // Press ArrowLeft to move back to the first action button (Read)
    actions[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    await tick();
    flushSync();
    expect(document.activeElement).toBe(actions[0]);

    // Press ArrowLeft from the first action button to return to Column 1
    actions[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    await tick();
    flushSync();
    expect(document.activeElement).toBe(firstRow);
  });

  it('cycles columns with Tab and Shift+Tab', async () => {
    openHub({ items: [scrollCell()] });
    await tick();
    await tick();
    flushSync();

    const firstRow = candidateRow();
    firstRow.focus();

    // Tab moves to Column 2
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await tick();
    await tick();
    flushSync();
    expect(document.activeElement).toBe(actionButtons()[0]);

    // Tab again wraps to Column 0
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await tick();
    await tick();
    flushSync();
    expect(document.activeElement).toBe(document.querySelector('.spine-row.active'));

    // Shift+Tab wraps back to Column 2
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    await tick();
    await tick();
    flushSync();
    expect(document.activeElement).toBe(actionButtons()[0]);
  });

  it('does not infinite loop or crash if all columns are empty', async () => {
    openHub({ items: [], equipment: [] });
    await tick();
    await tick();
    flushSync();
    
    expect(() => {
      // Dispatch ArrowLeft on list element to trigger focus re-anchoring and focusColumn
      const listEl = document.querySelector('.list') as HTMLElement;
      listEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    }).not.toThrow();
  });

  it('focuses the spine row closest vertically when transitioning left without previous user selection', async () => {
    // Open the hub with chest options and multiple spine categories to test vertical alignment
    openHub({
      items: [betterChestCell()],
      equipment: [
        chestSlot(),
        {
          slot: 'helm',
          label: 'Head',
          icon: 'helm',
          itemName: 'Leather Cap',
          statLabel: 'DEF 1',
          rarityColor: '#fff',
          empty: false,
          artUrl: '',
          availableCount: 0,
          availableLabel: '0 items available',
          hasUpgrade: false,
          options: [],
        }
      ]
    });
    await tick();
    await tick();
    flushSync();

    const firstRow = candidateRow();
    firstRow.focus();

    // Spine has 2 rows: Chest (top) and Head (bottom).
    const spineRows = Array.from(document.querySelectorAll('.spine-row')) as HTMLElement[];
    expect(spineRows.length).toBeGreaterThanOrEqual(2);

    // Mock bounding client rects to simulate vertical coordinates in happy-dom:
    // Row 0 (Chest): midpoint = 120
    // Row 1 (Head): midpoint = 220
    vi.spyOn(spineRows[0], 'getBoundingClientRect').mockReturnValue({
      top: 100,
      height: 40,
      bottom: 140,
      left: 10,
      right: 100,
      width: 90,
      x: 10,
      y: 100,
      toJSON: () => {}
    });
    vi.spyOn(spineRows[1], 'getBoundingClientRect').mockReturnValue({
      top: 200,
      height: 40,
      bottom: 240,
      left: 10,
      right: 100,
      width: 90,
      x: 10,
      y: 200,
      toJSON: () => {}
    });

    // Mock candidate row: midpoint = 230. It is vertically closest to Row 1 (Head).
    vi.spyOn(firstRow, 'getBoundingClientRect').mockReturnValue({
      top: 210,
      height: 40,
      bottom: 250,
      left: 110,
      right: 300,
      width: 190,
      x: 110,
      y: 210,
      toJSON: () => {}
    });

    // Press ArrowLeft to focus Column 0
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    await tick();
    flushSync();

    // Verifies it targeted Row 1 (Head) rather than default Row 0 (Chest)
    expect(document.activeElement).toBe(spineRows[1]);
  });

  it('resets spine selection state when reopening modal to recalculate closest vertical button', async () => {
    openHub({
      items: [betterChestCell()],
      equipment: [
        chestSlot(),
        {
          slot: 'helm',
          label: 'Head',
          icon: 'helm',
          itemName: 'Leather Cap',
          statLabel: 'DEF 1',
          rarityColor: '#fff',
          empty: false,
          artUrl: '',
          availableCount: 0,
          availableLabel: '0 items available',
          hasUpgrade: false,
          options: [],
        }
      ]
    });
    await tick();
    await tick();
    flushSync();

    const firstRow = candidateRow();
    const spineRows = Array.from(document.querySelectorAll('.spine-row')) as HTMLElement[];

    // Mock bounding client rects:
    // Row 0 (Chest): midpoint = 120
    // Row 1 (Head): midpoint = 220
    vi.spyOn(spineRows[0], 'getBoundingClientRect').mockReturnValue({
      top: 100, height: 40, bottom: 140, left: 10, right: 100, width: 90, x: 10, y: 100, toJSON: () => {}
    });
    vi.spyOn(spineRows[1], 'getBoundingClientRect').mockReturnValue({
      top: 200, height: 40, bottom: 240, left: 10, right: 100, width: 90, x: 10, y: 200, toJSON: () => {}
    });

    // Midpoint = 230, closest to Row 1 (Head)
    vi.spyOn(firstRow, 'getBoundingClientRect').mockReturnValue({
      top: 210, height: 40, bottom: 250, left: 110, right: 300, width: 190, x: 110, y: 210, toJSON: () => {}
    });

    // Press ArrowLeft to focus Column 0
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    await tick();
    flushSync();

    // Verifies it targeted Row 1 (Head)
    expect(document.activeElement).toBe(spineRows[1]);

    // Close the hub
    actions.setInventoryOpen(false);
    await tick();
    await tick();
    flushSync();

    // Reopen the hub
    ui.inventoryOpen = true;
    await tick();
    await tick();
    await tick();
    flushSync();

    // Setup new coordinates where the candidate is now closest to Row 0 (Chest)
    const newFirstRow = candidateRow();
    const newSpineRows = Array.from(document.querySelectorAll('.spine-row')) as HTMLElement[];

    vi.spyOn(newSpineRows[0], 'getBoundingClientRect').mockReturnValue({
      top: 100, height: 40, bottom: 140, left: 10, right: 100, width: 90, x: 10, y: 100, toJSON: () => {}
    });
    vi.spyOn(newSpineRows[1], 'getBoundingClientRect').mockReturnValue({
      top: 200, height: 40, bottom: 240, left: 10, right: 100, width: 90, x: 10, y: 200, toJSON: () => {}
    });

    // Midpoint = 110, closest to Row 0 (Chest)
    vi.spyOn(newFirstRow, 'getBoundingClientRect').mockReturnValue({
      top: 90, height: 40, bottom: 130, left: 110, right: 300, width: 190, x: 110, y: 90, toJSON: () => {}
    });

    newFirstRow.focus();
    newFirstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    await tick();
    flushSync();

    // Verifies it targeted Row 0 (Chest) on the second open instead of Row 1 (Head)
    expect(document.activeElement).toBe(newSpineRows[0]);
  });
});

describe('loadout hub — art readiness', () => {
  it('promotes visible modal art without moving keyboard focus', async () => {
    const requestImage = vi.spyOn(assetReadinessService, 'requestImage').mockImplementation((request: AssetReadinessRequest) => ({
      url: request.url,
      cancel: vi.fn(),
      snapshot: () => ({
        kind: 'image',
        url: request.url,
        state: 'queued',
        priority: request.priority,
        reason: request.reason,
        owner: request.owner,
        optional: request.optional,
      }),
      whenReady: () => Promise.resolve(false),
    }));

    openHub({ items: [artScrollCell()] });
    await tick();
    await tick();
    flushSync();

    const row = candidateRow();
    expect(document.activeElement).toBe(row);
    expect(requestImage).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'image',
      url: SCROLL_ART,
      priority: 'critical-now',
      reason: 'visible inventory modal art',
      owner: 'inventory-modal',
      optional: true,
    }));
    expect(document.querySelector('.detail.has-art')).not.toBeNull();
    expect(row.textContent).toContain('Scroll of Light');
  });

  it('keeps promotion scoped to the visible slot group instead of the full pack', async () => {
    const requestImage = vi.spyOn(assetReadinessService, 'requestImage').mockImplementation((request: AssetReadinessRequest) => ({
      url: request.url,
      cancel: vi.fn(),
      snapshot: () => ({ kind: 'image', url: request.url, state: 'queued', priority: request.priority }),
      whenReady: () => Promise.resolve(false),
    }));

    openHub({ items: [artBetterChestCell(), artScrollCell()], equipment: [artChestSlot()] });
    await tick();
    await tick();
    flushSync();

    const requestedUrls = requestImage.mock.calls.map(([request]) => request.url);
    expect(requestedUrls).toContain(ARMOR_ART);
    expect(requestedUrls).toContain('/inventory/tattered-rags.png');
    expect(requestedUrls).not.toContain(SCROLL_ART);
  });
});
