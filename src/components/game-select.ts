import { GAME_EVENTS } from '../events';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional text color (used for item rarity tinting). */
  color?: string;
  selected?: boolean;
  disabled?: boolean;
}

/**
 * <game-select> — a fully custom, themeable replacement for the native
 * <select>. It keeps a native-select-compatible surface (`.value`, a bubbling
 * `change` event) so existing wiring keeps working, while adding per-option
 * coloring, keyboard navigation, and a styled popup panel.
 *
 * It also emits a bubbling `dropdown-state-change` event so the game loop can
 * pause movement keys while a menu is open.
 */
export class GameSelect extends HTMLElement {
  private options: SelectOption[] = [];
  private currentValue = '';
  private placeholder = 'Select...';
  private isOpen = false;
  private highlighted = -1;

  private trigger!: HTMLButtonElement;
  private valueLabel!: HTMLSpanElement;
  private panel!: HTMLDivElement;
  private rendered = false;

  connectedCallback() {
    if (this.rendered) return;
    this.rendered = true;
    this.placeholder = this.getAttribute('placeholder') || this.placeholder;

    this.innerHTML = `
      <button class="gs-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="gs-value gs-placeholder">${this.placeholder}</span>
        <span class="gs-arrow" aria-hidden="true">▾</span>
      </button>
      <div class="gs-panel" role="listbox" tabindex="-1"></div>
    `;

    this.trigger = this.querySelector('.gs-trigger') as HTMLButtonElement;
    this.valueLabel = this.querySelector('.gs-value') as HTMLSpanElement;
    this.panel = this.querySelector('.gs-panel') as HTMLDivElement;

    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.trigger.addEventListener('keydown', (e) => this.onTriggerKey(e));
    this.panel.addEventListener('keydown', (e) => this.onPanelKey(e));

    // Close when focus or pointer leaves the component.
    this.outsideClick = this.outsideClick.bind(this);
  }

  /** Replace the option set and refresh the visible selection. */
  public setOptions(options: SelectOption[]) {
    this.options = options;
    const chosen = options.find(o => o.selected) || options.find(o => !o.disabled);
    this.currentValue = chosen ? chosen.value : '';
    this.renderOptions();
    this.renderValue();
  }

  get value(): string {
    return this.currentValue;
  }

  set value(v: string) {
    this.currentValue = v;
    this.renderValue();
    this.renderOptions();
  }

  public blur() {
    if (this.isOpen) this.close();
    this.trigger?.blur();
  }

  // --- internals -----------------------------------------------------------

  private renderValue() {
    const opt = this.options.find(o => o.value === this.currentValue);
    const usePlaceholder = !opt || opt.disabled;
    const text = usePlaceholder ? this.placeholder : opt!.label;
    this.valueLabel.textContent = text;
    this.valueLabel.classList.toggle('gs-placeholder', usePlaceholder);
    this.valueLabel.style.color = !usePlaceholder && opt?.color ? opt.color : '';
  }

  private renderOptions() {
    this.panel.innerHTML = this.options.map((o, i) => {
      const sel = o.value === this.currentValue ? ' is-selected' : '';
      const dis = o.disabled ? ' is-disabled' : '';
      const hi = i === this.highlighted ? ' is-highlighted' : '';
      const style = o.color ? ` style="color:${o.color}"` : '';
      return `<div class="gs-option${sel}${dis}${hi}" role="option" data-index="${i}"${style}>${o.label}</div>`;
    }).join('');

    this.panel.querySelectorAll('.gs-option').forEach(node => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((node as HTMLElement).dataset.index || '-1', 10);
        this.choose(idx);
      });
      node.addEventListener('mousemove', () => {
        const idx = parseInt((node as HTMLElement).dataset.index || '-1', 10);
        this.setHighlight(idx);
      });
    });
  }

  private choose(index: number) {
    const opt = this.options[index];
    if (!opt || opt.disabled) return;
    this.currentValue = opt.value;
    this.renderValue();
    this.close();
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: opt.value } }));
  }

  public toggle() {
    this.isOpen ? this.close() : this.open();
  }

  public open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.classList.add('is-open');
    this.trigger.setAttribute('aria-expanded', 'true');

    const selIdx = this.options.findIndex(o => o.value === this.currentValue && !o.disabled);
    this.setHighlight(selIdx >= 0 ? selIdx : this.options.findIndex(o => !o.disabled));
    this.panel.focus();

    document.addEventListener('click', this.outsideClick);
    this.dispatchEvent(new CustomEvent(GAME_EVENTS.DROPDOWN_STATE_CHANGE, { bubbles: true, detail: { open: true } }));
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.classList.remove('is-open');
    this.trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', this.outsideClick);
    this.dispatchEvent(new CustomEvent(GAME_EVENTS.DROPDOWN_STATE_CHANGE, { bubbles: true, detail: { open: false } }));
  }

  private outsideClick(e: MouseEvent) {
    if (!this.contains(e.target as Node)) this.close();
  }

  private setHighlight(index: number) {
    this.highlighted = index;
    const nodes = this.panel.querySelectorAll('.gs-option');
    nodes.forEach((n, i) => n.classList.toggle('is-highlighted', i === index));
    nodes[index]?.scrollIntoView({ block: 'nearest' });
  }

  private moveHighlight(delta: number) {
    const n = this.options.length;
    if (!n) return;
    let i = this.highlighted;
    for (let step = 0; step < n; step++) {
      i = (i + delta + n) % n;
      if (!this.options[i].disabled) {
        this.setHighlight(i);
        return;
      }
    }
  }

  private onTriggerKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (!this.isOpen) this.open();
    }
  }

  private onPanelKey(e: KeyboardEvent) {
    // Keep menu navigation from leaking into the game's movement handler.
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.moveHighlight(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.moveHighlight(-1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.choose(this.highlighted);
        this.trigger.focus();
        break;
      case 'Escape':
      case 'Tab':
        this.close();
        this.trigger.focus();
        break;
    }
  }
}

if (!customElements.get('game-select')) {
  customElements.define('game-select', GameSelect);
}
