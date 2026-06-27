import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent } from './presentationEvents';

export interface MapRenderer {
  mount(host: HTMLElement): void;
  setSnapshot(snapshot: MapSnapshot): void;
  dispatch(event: PresentationEvent): void;
  resize(bounds: DOMRectReadOnly): void;
  tick(now: number): boolean;
  destroy(): void;
}
