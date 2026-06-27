import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ui } from '../ui/store.svelte';
import { GameUiPresenterAdapter, type GameUiPresenterTarget } from './gameUiPresenter';
import { copyPresentationMode, DEFAULT_PRESENTATION_MODE, type PresentationMode } from './presenter';

function createLegacyUiFake() {
  return {
    setMapSnapshot: vi.fn(),
    publishMapEvent: vi.fn(),
    updateStats: vi.fn(),
    updateDropdowns: vi.fn(),
    resetLog: vi.fn(),
    renderLogs: vi.fn(),
    syncDiscovery: vi.fn(),
    fxPlayerRun: vi.fn(),
    fxStrike: vi.fn(),
    fxHit: vi.fn(),
    fxFreeze: vi.fn(),
    fxDeath: vi.fn(),
    fxPlayerHit: vi.fn(),
    fxDive: vi.fn(),
    fxWhiff: vi.fn(),
    fxFloat: vi.fn(),
    fxMonsterDodge: vi.fn(),
    mapRumble: vi.fn(),
    beginFloorTransition: vi.fn(),
    setAiming: vi.fn(),
    publishEndRunState: vi.fn(),
    resetEndRunState: vi.fn(),
  } satisfies GameUiPresenterTarget;
}

describe('GameUiPresenterAdapter presentation mode', () => {
  beforeEach(() => {
    ui.presentationMode = copyPresentationMode(DEFAULT_PRESENTATION_MODE);
  });

  it('defaults to dungeon-map and publishes copied mode state for chrome', () => {
    const legacyUi = createLegacyUiFake();
    const presenter = new GameUiPresenterAdapter(legacyUi);
    const mode: PresentationMode = {
      type: 'boss-encounter',
      bossKey: 'monster-7',
      scope: { kind: 'room', rect: { l: 2, t: 3, r: 9, b: 8 }, entryDir: 'down' },
    };

    expect(presenter.getMode()).toEqual({ type: 'dungeon-map' });

    presenter.setMode(mode);
    (mode as { scope: { rect: { l: number } } }).scope.rect.l = 99;

    expect(presenter.getMode()).toEqual({
      type: 'boss-encounter',
      bossKey: 'monster-7',
      scope: { kind: 'room', rect: { l: 2, t: 3, r: 9, b: 8 }, entryDir: 'down' },
    });
    expect(ui.presentationMode).toEqual(presenter.getMode());
    expect(legacyUi.publishMapEvent).not.toHaveBeenCalled();
  });

  it('handles modeChanged events and can return to dungeon-map', () => {
    const legacyUi = createLegacyUiFake();
    const presenter = new GameUiPresenterAdapter(legacyUi);

    presenter.publishEvent({ type: 'presentation.modeChanged', mode: { type: 'end-run-transition', runId: 'run-1' } });
    expect(presenter.getMode()).toEqual({ type: 'end-run-transition', runId: 'run-1' });
    expect(ui.presentationMode).toEqual({ type: 'end-run-transition', runId: 'run-1' });

    presenter.publishEvent({ type: 'presentation.modeChanged', mode: { type: 'dungeon-map' } });
    expect(presenter.getMode()).toEqual({ type: 'dungeon-map' });
    expect(ui.presentationMode).toEqual({ type: 'dungeon-map' });
    expect(legacyUi.publishMapEvent).toHaveBeenCalledTimes(2);
  });

  it('routes aiming changes to chrome and still forwards the map event', () => {
    const legacyUi = createLegacyUiFake();
    const presenter = new GameUiPresenterAdapter(legacyUi);

    presenter.publishEvent({ type: 'aiming.changed', wandName: 'Wand of Cold' });
    presenter.publishEvent({ type: 'aiming.changed', wandName: null });

    expect(legacyUi.setAiming).toHaveBeenNthCalledWith(1, { wandName: 'Wand of Cold' });
    expect(legacyUi.setAiming).toHaveBeenNthCalledWith(2, null);
    expect(legacyUi.publishMapEvent).toHaveBeenCalledTimes(2);
  });
});
