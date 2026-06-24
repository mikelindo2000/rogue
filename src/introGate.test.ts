import { describe, it, expect } from 'vitest';
import { shouldShowIntro } from './introGate';

describe('shouldShowIntro', () => {
  it('shows for a brand-new visitor (no save, never seen)', () => {
    expect(shouldShowIntro(false, false)).toBe(true);
  });

  it('hides once dismissed, even with no save', () => {
    expect(shouldShowIntro(false, true)).toBe(false);
  });

  it('hides for a returning player with a save', () => {
    expect(shouldShowIntro(true, false)).toBe(false);
    expect(shouldShowIntro(true, true)).toBe(false);
  });
});
