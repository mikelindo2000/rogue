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

  it('renders stair glyphs as trusted inline log mentions', () => {
    const html = enrichLogMessageHtml(
      'Welcome to the Dungeon! Move onto stairs (< or >) to travel between floors.'
    );

    expect(html).toContain('class="stair-mention stair-mention--up"');
    expect(html).toContain('class="stair-mention stair-mention--down"');
    expect(html).toContain('>&lt;</span> or <span');
    expect(html).toContain('>&gt;</span>) to travel');
    expect(html).not.toContain('&amp;lt;');
    expect(html).not.toContain('&amp;gt;');
  });

  it('preserves pre-styled rarity spans on looted gear instead of escaping them', () => {
    const styled =
      '<span style="color:var(--rarity-rare);font-weight:600;">Leather Shoes +2</span>';
    const html = enrichLogMessageHtml(`Looted: ${styled} (5 DEF).`);

    expect(html).toContain(styled);
    expect(html).not.toContain('&lt;span');
    expect(html).not.toContain('&gt;');
    // Surrounding plain text is still escaped/handled normally.
    expect(html).toContain('Looted: ');
    expect(html).toContain(' (5 DEF).');
  });
});
