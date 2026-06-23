import { describe, expect, it } from 'vitest';
import { appendLogLine } from './logHistory';
import type { LogLineView } from './store.svelte';

describe('log history', () => {
  it('updates the previous line instead of appending consecutive duplicates', () => {
    let logs: LogLineView[] = [];

    let result = appendLogLine(logs, { n: 1, html: 'You search carefully.' });
    logs = result.lines;
    expect(result.appended).toBe(true);

    result = appendLogLine(logs, { n: 2, html: 'You search carefully.' });
    logs = result.lines;
    expect(result.appended).toBe(false);

    result = appendLogLine(logs, { n: 2, html: 'You found a hidden door.' });
    logs = result.lines;
    expect(result.appended).toBe(true);

    expect(logs).toEqual([
      { n: 1, html: 'You search carefully.', count: 2 },
      { n: 2, html: 'You found a hidden door.' },
    ]);
  });
});
