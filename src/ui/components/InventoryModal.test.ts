// @vitest-environment happy-dom
//
// Component-level test harness for the inventory modal's keyboard verbs. The
// game-logic suites run DOM-free under Node; this file opts into happy-dom (via
// the docblock above) and mounts the real Svelte component so the drop mnemonic,
// the primary-action default, and the click path are exercised end to end
// against the live store wiring rather than a mock of it.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import InventoryModal from './InventoryModal.svelte';
import { ui, actions, type InventoryCell } from '../store.svelte';
import type { InventoryAction, InventoryRef } from '../../types';

const SCROLL_REF: InventoryRef = { kind: 'scroll', scrollType: 'light' };

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

let host: ReturnType<typeof mount> | null = null;
let inventoryAction: Mock<(ref: InventoryRef, action: InventoryAction) => void>;

function openModalWith(cells: InventoryCell[]) {
  ui.inventoryItems = cells;
  ui.inventoryFilterKind = 'all';
  ui.selectedInventoryRef = cells[0]?.ref ?? null;
  ui.inventoryOpen = true;
  host = mount(InventoryModal, { target: document.body });
  flushSync();
}

function rowButton(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>('.list .row');
  if (!el) throw new Error('no inventory row rendered');
  return el;
}

function actionButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.detail-pane .action'));
}

beforeEach(() => {
  inventoryAction = vi.fn<(ref: InventoryRef, action: InventoryAction) => void>();
  // The modal calls these store hooks; wire them to mutate the real store the
  // way main.ts does, so derived state (selection, open) behaves authentically.
  actions.inventoryAction = inventoryAction;
  actions.selectInventoryItem = (ref) => { ui.selectedInventoryRef = ref; };
  actions.setInventoryOpen = (open) => { ui.inventoryOpen = open; };
});

afterEach(() => {
  if (host) { unmount(host); host = null; }
  document.body.innerHTML = '';
  ui.inventoryOpen = false;
  ui.inventoryItems = [];
  ui.selectedInventoryRef = null;
  vi.restoreAllMocks();
});

describe('InventoryModal keyboard + actions', () => {
  it('renders a Drop action button for a carried item', () => {
    openModalWith([scrollCell()]);
    const labels = actionButtons().map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Read', 'Drop']);
  });

  it('drops the selected item when Drop is clicked', () => {
    openModalWith([scrollCell()]);
    const drop = actionButtons().find((b) => b.textContent?.trim() === 'Drop')!;
    drop.click();
    expect(inventoryAction).toHaveBeenCalledWith(SCROLL_REF, 'drop');
  });

  it('drops the selected item on the modal "d" mnemonic', () => {
    openModalWith([scrollCell()]);
    const row = rowButton();
    row.focus();
    // Dispatch on the focused row (event.target inside the modal body) so the
    // handler's containment guard passes, mirroring a real bubbled keypress.
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    expect(inventoryAction).toHaveBeenCalledWith(SCROLL_REF, 'drop');
  });

  it('keeps Return bound to the primary verb, never Drop', () => {
    openModalWith([scrollCell()]);
    const row = rowButton();
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(inventoryAction).toHaveBeenCalledWith(SCROLL_REF, 'use');
    expect(inventoryAction).not.toHaveBeenCalledWith(SCROLL_REF, 'drop');
  });

  it('does not fire Drop for keypresses outside the modal body', () => {
    openModalWith([scrollCell()]);
    // event.target = window, which is not inside the modal body.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    expect(inventoryAction).not.toHaveBeenCalled();
  });
});
