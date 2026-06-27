// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import BalancePanel from './BalancePanel.svelte';
import { actions, ui } from '../store.svelte';

let host: ReturnType<typeof mount> | null = null;

function openPanel() {
  ui.balancePanelOpen = true;
  host = mount(BalancePanel, { target: document.body });
  flushSync();
}

function tab(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab')).find((el) =>
    el.textContent?.includes(label)
  );
  if (!button) throw new Error(`Tab not rendered: ${label}`);
  return button;
}

function loading(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.loading');
}

beforeEach(() => {
  ui.balancePanelOpen = false;
  actions.setBalancePanelOpen = (open) => {
    ui.balancePanelOpen = open;
  };
});

afterEach(() => {
  if (host) {
    unmount(host);
    host = null;
  }
  document.body.innerHTML = '';
  ui.balancePanelOpen = false;
});

describe('BalancePanel full-run tab', () => {
  it('switches to the run tab instantly with a loading state, then fills the result', async () => {
    openPanel();

    tab('Full run').click();
    flushSync();

    // Switch is instant: the heavy sim has not run yet, the loading state shows.
    expect(loading()).not.toBeNull();
    expect(document.querySelector('table')).toBeNull();

    // After the deferred macrotask, the result fills in.
    await new Promise((r) => setTimeout(r, 0));
    flushSync();

    expect(loading()).toBeNull();
    expect(document.querySelector('table')).not.toBeNull();
  });

  it('clears the result when switching away mid-computation (no stale flash)', async () => {
    openPanel();

    tab('Full run').click();
    flushSync();
    expect(loading()).not.toBeNull();

    // Leave before the deferred sim resolves.
    tab('Per-monster').click();
    flushSync();

    await new Promise((r) => setTimeout(r, 0));
    flushSync();

    // Per-monster content is showing; no run loading/result leaked through.
    expect(loading()).toBeNull();

    // Re-entering shows the loading state again, not a stale result.
    tab('Full run').click();
    flushSync();
    expect(loading()).not.toBeNull();
  });
});
