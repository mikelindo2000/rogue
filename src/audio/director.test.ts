import { describe, expect, it } from 'vitest';
import { selectMusicContext, type MusicState } from './director';

const state = (over: Partial<MusicState> = {}): MusicState => ({
  gameOver: false,
  gameWon: false,
  monsters: [{}],
  dungeonFloor: 1,
  ...over,
});

describe('selectMusicContext', () => {
  it('run end outranks everything', () => {
    expect(selectMusicContext(state({ gameOver: true, monsters: [{ special: 'boss' }] }))).toBe('gameover');
    expect(selectMusicContext(state({ gameWon: true }))).toBe('victory');
  });

  it('a boss present outranks depth and respite', () => {
    expect(selectMusicContext(state({ dungeonFloor: 1, monsters: [{}, { special: 'boss' }] }))).toBe('boss');
  });

  it('a cleared floor is a respite', () => {
    expect(selectMusicContext(state({ monsters: [] }))).toBe('safe');
  });

  it('depth selects the explore bed', () => {
    expect(selectMusicContext(state({ dungeonFloor: 3 }))).toBe('explore-shallow');
    expect(selectMusicContext(state({ dungeonFloor: 4 }))).toBe('explore-deep');
    expect(selectMusicContext(state({ dungeonFloor: 12 }))).toBe('explore-deep');
  });
});
