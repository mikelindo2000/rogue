// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import SettingsModal from './SettingsModal.svelte';
import { actions, ui } from '../store.svelte';
import type { BoardSizeId } from '../../boards';

let host: ReturnType<typeof mount> | null = null;
let setBoardSize: Mock<(id: BoardSizeId) => void>;

function openSettings() {
  ui.settingsOpen = true;
  host = mount(SettingsModal, { target: document.body });
  flushSync();
}

function displayTab(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.nav-item'))
    .find((el) => el.textContent?.includes('Display'));
  if (!button) throw new Error('Display tab not rendered');
  return button;
}

function boardOptions(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.board-option'));
}

function key(target: HTMLElement, value: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
  flushSync();
}

beforeEach(() => {
  ui.settingsOpen = false;
  ui.audioMuted = false;
  ui.audioVolume = 1;
  ui.musicMuted = false;
  ui.musicVolume = 0.4;
  ui.boardSize = 'classic';
  setBoardSize = vi.fn((id: BoardSizeId) => { ui.boardSize = id; });
  actions.setBoardSize = setBoardSize;
  actions.setSettingsOpen = (open) => { ui.settingsOpen = open; };
  actions.setAudioMuted = (muted) => { ui.audioMuted = muted; };
  actions.setAudioVolume = (volume) => { ui.audioVolume = volume; };
  actions.setMusicMuted = (muted) => { ui.musicMuted = muted; };
  actions.setMusicVolume = (volume) => { ui.musicVolume = volume; };
  actions.testSound = () => {};
});

afterEach(() => {
  if (host) { unmount(host); host = null; }
  document.body.innerHTML = '';
  ui.settingsOpen = false;
  ui.boardSize = 'classic';
  vi.restoreAllMocks();
});

describe('SettingsModal board size picker', () => {
  it('keeps the modal subtree mounted while closed to avoid detached-node churn', async () => {
    openSettings();
    const firstSubtree = document.querySelector<HTMLElement>('.settings');
    expect(firstSubtree).not.toBeNull();

    actions.setSettingsOpen(false);
    await tick();
    flushSync();

    expect(firstSubtree?.closest('[hidden]')).not.toBeNull();

    actions.setSettingsOpen(true);
    await tick();
    flushSync();

    expect(document.querySelector('.settings')).toBe(firstSubtree);
    expect(firstSubtree?.closest('[hidden]')).toBeNull();
  });

  it('chooses a board size through the display panel control', () => {
    openSettings();
    displayTab().click();
    flushSync();

    boardOptions().find((button) => button.textContent?.includes('Huge'))!.click();

    expect(setBoardSize).toHaveBeenCalledWith('huge');
    expect(ui.boardSize).toBe('huge');
  });

  it('uses arrow keys to choose and focus the next board size', () => {
    openSettings();
    displayTab().click();
    flushSync();

    const [classic, large] = boardOptions();
    classic.focus();
    key(classic, 'ArrowDown');

    expect(setBoardSize).toHaveBeenCalledWith('large');
    expect(ui.boardSize).toBe('large');
    expect(document.activeElement).toBe(large);
    expect(classic.tabIndex).toBe(-1);
    expect(large.tabIndex).toBe(0);
  });
});
