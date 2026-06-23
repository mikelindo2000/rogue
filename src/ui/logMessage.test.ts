import { describe, expect, it } from 'vitest';
import { enrichLogMessageHtml } from './logMessage';

describe('log message enrichment', () => {
  it('keeps item mention markup intact on the message-log path', () => {
    const html = enrichLogMessageHtml('Picked up a Potion of Healing.');

    expect(html).toContain('data-item-id="potion-healing"');
    expect(html).toContain('<svg class="item-mention__icon"');
    expect(html).toContain('<span class="item-mention__name">Potion of Healing</span>');
    expect(html).not.toContain('&lt;svg');
    expect(html).not.toContain('&lt;/span&gt;');
  });

  it('can enrich an item and a monster in one message', () => {
    const html = enrichLogMessageHtml('Potion of Strength helps against Orc.');

    expect(html).toContain('data-item-id="potion-strength"');
    expect(html).toContain('data-monster-id="orc"');
  });
});
