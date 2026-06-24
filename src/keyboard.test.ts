import { describe, it, expect } from 'vitest';
import { KeyboardManager, formatKeyLabel } from './keyboard';

describe('formatKeyLabel', () => {
  it('maps arrow keys to glyphs', () => {
    expect(formatKeyLabel('ArrowUp')).toBe('↑');
    expect(formatKeyLabel('ArrowDown')).toBe('↓');
    expect(formatKeyLabel('ArrowLeft')).toBe('←');
    expect(formatKeyLabel('ArrowRight')).toBe('→');
  });

  it('labels space and escape', () => {
    expect(formatKeyLabel(' ')).toBe('Space');
    expect(formatKeyLabel('Escape')).toBe('Esc');
  });

  it('upper-cases single characters and passes multi-char keys through', () => {
    expect(formatKeyLabel('w')).toBe('W');
    expect(formatKeyLabel('?')).toBe('?');
    expect(formatKeyLabel('Tab')).toBe('Tab');
  });
});

describe('KeyboardManager.list', () => {
  it('returns registered bindings with display-cased keys, in order', () => {
    const km = new KeyboardManager();
    km.register({ keys: ['w', 'ArrowUp'], description: 'Move up', callback: () => {} });
    km.register({ keys: ['?'], description: 'Show all shortcuts', callback: () => {} });

    const list = km.list();
    expect(list).toHaveLength(2);
    // display-cased, not the normalized lowercase used for matching
    expect(list[0]).toMatchObject({
      keys: ['w', 'ArrowUp'],
      description: 'Move up',
      context: 'game',
      ctrlOrMeta: false,
    });
    expect(list[1].keys).toEqual(['?']);
  });

  it('omits hidden bindings and reports ctrlOrMeta + context', () => {
    const km = new KeyboardManager();
    km.register({ keys: ['b'], description: 'dev', ctrlOrMeta: true, hidden: true, callback: () => {} });
    km.register({ keys: ['ArrowUp'], description: 'Zap up', context: 'aiming', callback: () => {} });

    const list = km.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ description: 'Zap up', context: 'aiming', ctrlOrMeta: false });
    expect(list.some((s) => s.description === 'dev')).toBe(false);
  });
});
