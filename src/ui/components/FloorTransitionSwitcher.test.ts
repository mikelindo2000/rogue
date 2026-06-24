// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FloorTransitionSwitcher from './FloorTransitionSwitcher.svelte';
import { actions, ui } from '../store.svelte';

let host: ReturnType<typeof mount> | null = null;
let setFloorTransition: Mock<(id: string) => void>;

function buttons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.fx-option'));
}

function key(target: HTMLElement, value: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
  flushSync();
}

beforeEach(() => {
  ui.floorTransition = 'zpush';
  setFloorTransition = vi.fn((id: string) => { ui.floorTransition = id; });
  actions.setFloorTransition = setFloorTransition;
  host = mount(FloorTransitionSwitcher, { target: document.body });
  flushSync();
});

afterEach(() => {
  if (host) { unmount(host); host = null; }
  document.body.innerHTML = '';
  ui.floorTransition = 'zpush';
  vi.restoreAllMocks();
});

describe('FloorTransitionSwitcher keyboard behavior', () => {
  it('uses arrow keys to move focus and select the next effect', () => {
    const [first, second] = buttons();
    first.focus();

    key(first, 'ArrowRight');

    expect(setFloorTransition).toHaveBeenCalledWith('dissolve');
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
  });

  it('wraps with arrow keys and supports Home/End', () => {
    const [first, , third] = buttons();
    first.focus();

    key(first, 'ArrowLeft');
    expect(setFloorTransition).toHaveBeenLastCalledWith('gravity');
    expect(document.activeElement).toBe(third);

    key(third, 'Home');
    expect(setFloorTransition).toHaveBeenLastCalledWith('zpush');
    expect(document.activeElement).toBe(first);

    key(first, 'End');
    expect(setFloorTransition).toHaveBeenLastCalledWith('gravity');
    expect(document.activeElement).toBe(third);
  });

  it('keeps switcher keystrokes from bubbling to global game shortcuts', () => {
    const spy = vi.fn();
    window.addEventListener('keydown', spy);
    const [first] = buttons();
    first.focus();

    key(first, ' ');

    expect(setFloorTransition).toHaveBeenCalledWith('zpush');
    expect(spy).not.toHaveBeenCalled();
    window.removeEventListener('keydown', spy);
  });
});
