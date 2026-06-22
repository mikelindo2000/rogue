/**
 * Names of the bubbling CustomEvents components use to talk to the app shell.
 * Centralized so a typo can't silently break the keyboard-context wiring.
 */
export const GAME_EVENTS = {
  /** Fired by <game-modal> when it opens/closes. detail: { open: boolean } */
  MODAL_STATE_CHANGE: 'modal-state-change',
  /** Fired by <game-select> when its panel opens/closes. detail: { open: boolean } */
  DROPDOWN_STATE_CHANGE: 'dropdown-state-change',
} as const;
