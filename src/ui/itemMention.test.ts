import { describe, expect, it } from 'vitest';
import { enrichItemMentionsHtml } from './itemMention';

describe('item mention enrichment', () => {
  it('adds inline potion icons to log text', () => {
    const html = enrichItemMentionsHtml('Picked up a Potion of Healing.');

    expect(html).toContain('class="item-mention item-mention--log"');
    expect(html).toContain('data-item-id="potion-healing"');
    expect(html).toContain('class="item-mention__icon"');
    expect(html).toContain('>Potion of Healing</span>');
  });

  it('adds inline scroll icons to log text', () => {
    const html = enrichItemMentionsHtml('You read the Scroll of Magic Mapping.');

    expect(html).toContain('data-item-id="scroll-magic_mapping"');
    expect(html).toContain('>Scroll of Magic Mapping</span>');
  });

  it('escapes plain text around item mentions', () => {
    const html = enrichItemMentionsHtml('Use Potion of Armor <now>.');

    expect(html).toContain('Potion of Armor');
    expect(html).toContain('&lt;now&gt;');
  });
});
