export interface KeyBinding {
  keys: string[];
  description: string;
  callback: (e: KeyboardEvent) => void;
  context?: string; // e.g. 'game', 'modal', 'global'. Defaults to 'game'
  /** Require the Ctrl (or ⌘ on macOS) modifier. Bindings without this flag only
   *  fire when Ctrl/Meta is NOT held, so plain movement keys don't trigger on
   *  browser/OS chords like ⌘B. Shift is unaffected (it gates run-movement in
   *  the callback, not the key match). */
  ctrlOrMeta?: boolean;
  /** Hide from the player-facing shortcuts list (e.g. dev-only chords). */
  hidden?: boolean;
}

/** A registered binding, flattened for the help UI (see `KeyboardManager.list`). */
export interface ShortcutInfo {
  /** Display-cased keys (e.g. 'ArrowUp', not the normalized 'arrowup'). */
  keys: string[];
  description: string;
  context: string;
  ctrlOrMeta: boolean;
}

const KEY_LABELS: Record<string, string> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  ' ': 'Space',
  escape: 'Esc',
  enter: '↵',
};

/** Map a raw key string to a compact, human-readable cap label. */
export function formatKeyLabel(key: string): string {
  const k = key.toLowerCase();
  if (KEY_LABELS[k]) return KEY_LABELS[k];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export class KeyboardManager {
  private bindings: KeyBinding[] = [];
  /** Original (display-cased) keys per binding, parallel to `bindings`. */
  private displayKeys: string[][] = [];
  private activeContexts: Set<string> = new Set(['global', 'game']);
  private isSuspended: boolean = false;
  private boundHandler = this.handleKeyDown.bind(this);

  constructor() {
    // Guard for non-DOM environments (unit tests run under Node).
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundHandler);
    }
  }

  /**
   * Register a new key binding.
   */
  public register(binding: KeyBinding) {
    // Normalise keys to lowercase for comparison, but keep the original casing
    // for display in the shortcuts list.
    const normalizedKeys = binding.keys.map(k => k.toLowerCase());
    this.bindings.push({
      ...binding,
      keys: normalizedKeys,
      context: binding.context || 'game'
    });
    this.displayKeys.push(binding.keys);
  }

  /**
   * Snapshot of all player-facing bindings for the help UI, in registration
   * order. Hidden (dev-only) bindings are omitted. This is the single source of
   * truth the shortcuts modal and How-to-Play guide render from.
   */
  public list(): ShortcutInfo[] {
    const out: ShortcutInfo[] = [];
    this.bindings.forEach((b, i) => {
      if (b.hidden) return;
      out.push({
        keys: this.displayKeys[i],
        description: b.description,
        context: b.context || 'game',
        ctrlOrMeta: !!b.ctrlOrMeta,
      });
    });
    return out;
  }

  /**
   * Activate or deactivate a binding context (e.g. 'game', 'modal').
   */
  public setContextActive(context: string, active: boolean) {
    if (active) {
      this.activeContexts.add(context);
    } else {
      this.activeContexts.delete(context);
    }
  }

  /**
   * Check if a context is currently active.
   */
  public isContextActive(context: string): boolean {
    return this.activeContexts.has(context);
  }

  /**
   * Suspend all keyboard listener execution.
   */
  public suspend() {
    this.isSuspended = true;
  }

  /**
   * Resume keyboard listener execution.
   */
  public resume() {
    this.isSuspended = false;
  }

  /**
   * Clean up window event listener.
   */
  public destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundHandler);
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.isSuspended) return;

    // Check if the user is typing in a form input or select element
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || 
                     target.tagName === 'SELECT' || 
                     target.tagName === 'TEXTAREA' || 
                     target.isContentEditable;

    // We normalize key inputs for match comparisons
    const pressedKey = e.key.toLowerCase();

    // Find a matching key binding under active contexts
    const matched = this.bindings.find(b => {
      // Check if this binding's context is currently active
      const context = b.context || 'game';
      if (!this.activeContexts.has(context) && context !== 'global') {
        return false;
      }

      // Check if the key matches
      const keyMatches = b.keys.includes(pressedKey);
      if (!keyMatches) return false;

      // The Ctrl/Meta modifier state must match the binding's requirement, so a
      // chord like ⌘B only hits ctrlOrMeta bindings and a bare key never fires
      // while Ctrl/⌘ is held.
      if (!!b.ctrlOrMeta !== (e.ctrlKey || e.metaKey)) return false;

      // If the user is typing, we ONLY trigger the binding if it is specifically registered
      // to handle Escape or special controls, avoiding typing letters triggering movement/actions.
      if (isTyping) {
        return e.key === 'Escape';
      }

      return true;
    });

    if (matched) {
      e.preventDefault();
      matched.callback(e);
    }
  }
}
