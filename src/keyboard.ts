export interface KeyBinding {
  keys: string[];
  description: string;
  callback: (e: KeyboardEvent) => void;
  context?: string; // e.g. 'game', 'modal', 'global'. Defaults to 'game'
}

export class KeyboardManager {
  private bindings: KeyBinding[] = [];
  private activeContexts: Set<string> = new Set(['global', 'game']);
  private isSuspended: boolean = false;

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Register a new key binding.
   */
  public register(binding: KeyBinding) {
    // Normalise keys to lowercase for comparison
    const normalizedKeys = binding.keys.map(k => k.toLowerCase());
    this.bindings.push({
      ...binding,
      keys: normalizedKeys,
      context: binding.context || 'game'
    });
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
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
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
