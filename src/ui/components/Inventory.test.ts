// @vitest-environment happy-dom
//
// Component-level harness for the HUD inventory grid. The pack has no real
// capacity cap (only food is limited), so the grid must render one cell per
// carried item — padding with empty slots up to inventoryMax when the pack is
// light, and growing past inventoryMax (the overflow then scrolls via CSS) once
// the player carries more than the baseline slot count.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Inventory from './Inventory.svelte';
import { ui, actions, type InventoryCell } from '../store.svelte';
import type { InventoryRef } from '../../types';

function potionCell(i: number): InventoryCell {
  const ref: InventoryRef = { kind: 'potion', potionType: 'healing' };
  return {
    icon: 'leaf',
    artUrl: '',
    rarityColor: '#7aa2ff',
    label: `Potion ${i + 1}`,
    detail: 'A test potion.',
    ref,
    actions: [{ action: 'use', label: 'Quaff' }],
  };
}

let host: ReturnType<typeof mount> | null = null;

function render(itemCount: number) {
  ui.inventoryItems = Array.from({ length: itemCount }, (_, i) => potionCell(i));
  ui.inventoryCount = itemCount;
  host = mount(Inventory, { target: document.body });
  flushSync();
}

function slots(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.grid > .slot, .grid > .slot-wrap'));
}

beforeEach(() => {
  // Inventory click hooks aren't exercised here, but stub them so the component
  // wires cleanly against the real store the way main.ts does.
  actions.selectInventoryItem = () => {};
  actions.setInventoryOpen = () => {};
});

afterEach(() => {
  if (host) { unmount(host); host = null; }
  document.body.innerHTML = '';
  ui.inventoryItems = [];
  ui.inventoryCount = 0;
});

describe('HUD inventory grid', () => {
  it('pads to the baseline slot count when the pack is light', () => {
    render(3);
    const cells = slots();
    expect(cells.length).toBe(ui.inventoryMax);
    expect(document.querySelectorAll('.grid .slot.filled').length).toBe(3);
    expect(document.querySelectorAll('.grid .slot.empty').length).toBe(ui.inventoryMax - 3);
  });

  it('draws exactly the baseline count when the pack is empty', () => {
    render(0);
    expect(slots().length).toBe(ui.inventoryMax);
    expect(document.querySelectorAll('.grid .slot.empty').length).toBe(ui.inventoryMax);
    expect(document.querySelector('.meta')?.textContent?.trim()).toBe('0 items');
  });

  it('grows past the baseline so overflow items still render (and can scroll)', () => {
    const count = ui.inventoryMax + 5;
    render(count);
    const cells = slots();
    expect(cells.length).toBe(count);
    // Every carried item gets a real, filled slot — nothing is truncated.
    expect(document.querySelectorAll('.grid .slot.filled').length).toBe(count);
    expect(document.querySelectorAll('.grid .slot.empty').length).toBe(0);
    expect(document.querySelector('.meta')?.textContent?.trim()).toBe(`${count} items`);
  });

  it('uses a singular label for a single item', () => {
    render(1);
    expect(document.querySelector('.meta')?.textContent?.trim()).toBe('1 item');
  });
});
