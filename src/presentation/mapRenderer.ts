import type { MapSnapshot } from './mapSnapshot';
import type { PresentationEvent } from './presentationEvents';

/**
 * Renderer boundary: implementations draw MapSnapshot data and play
 * PresentationEvent effects only. They must not read engine objects, mutate
 * Svelte chrome state, or own keyboard/gameplay commands.
 */
export interface MapRenderer {
  mount(host: HTMLElement): void;
  setSnapshot(snapshot: MapSnapshot): void;
  dispatch(event: PresentationEvent): void;
  resize(bounds: DOMRectReadOnly): void;
  tick(now: number): boolean;
  destroy(): void;
}
