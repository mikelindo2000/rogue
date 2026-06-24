// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Consumables from './Consumables.svelte';
import { buildPotionOptions } from '../potionView';
import { actions, ui } from '../store.svelte';

let host: ReturnType<typeof mount> | null = null;
let usePotion: Mock<(idx: number) => void>;

beforeEach(() => {
  ui.food = 0;
  ui.foodMax = 4;
  ui.potions = buildPotionOptions(['healing', 'healing', 'strength']);
  ui.potionMenuOpen = false;
  usePotion = vi.fn();
  actions.usePotion = usePotion;
  actions.eat = () => {};
  host = mount(Consumables, { target: document.body });
  flushSync();
});

afterEach(() => {
  if (host) { unmount(host); host = null; }
  document.body.innerHTML = '';
  ui.potions = [];
  ui.potionMenuOpen = false;
  vi.restoreAllMocks();
});

describe('Consumables potion menu', () => {
  it('shows one row per potion stack with the stack count on the right', () => {
    document.querySelector<HTMLButtonElement>('.potion')!.click();
    flushSync();

    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(rows.map((row) => row.querySelector('.lbl')?.textContent?.trim())).toEqual(['Healing', 'Strength']);
    expect(rows[0].querySelector('.meta')?.textContent?.trim()).toBe('×2');
    expect(rows[1].querySelector('.meta')).toBeNull();
    expect(document.querySelector('.potion .count')?.textContent?.trim()).toBe('3');
  });

  it('uses the first inventory index for the selected stack', () => {
    document.querySelector<HTMLButtonElement>('.potion')!.click();
    flushSync();

    document.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();

    expect(usePotion).toHaveBeenCalledWith(0);
  });
});
