import type { GamePresenter } from './presentation/presenter';
import type { PresentationEvent } from './presentation/presentationEvents';

export const createTestPresenter = (overrides: Partial<GamePresenter> = {}): GamePresenter => ({
  setMode: () => {},
  publishStats: () => {},
  publishInventory: () => {},
  publishMap: () => {},
  publishLogs: () => {},
  publishDiscovery: () => {},
  publishEvent: () => {},
  showItemPickup: () => {},
  clearItemPickup: () => {},
  resetLog: () => {},
  renderLogs: () => {},
  syncDiscovery: () => {},
  ...overrides,
});

export interface RecordingGamePresenter extends GamePresenter {
  readonly events: PresentationEvent[];
}

export const createRecordingPresenter = (overrides: Partial<GamePresenter> = {}): RecordingGamePresenter => {
  const events: PresentationEvent[] = [];
  return {
    ...createTestPresenter({
      publishEvent: event => events.push(event),
      ...overrides,
    }),
    events,
  };
};
