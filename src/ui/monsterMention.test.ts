import { describe, expect, it } from 'vitest';
import { enrichMonsterMentionsHtml } from './monsterMention';

describe('monster mention enrichment', () => {
  it('adds the monster glyph and full name to log text', () => {
    const html = enrichMonsterMentionsHtml('You strike Orc for 4 dmg.');

    expect(html).toContain('class="monster-mention monster-mention--log');
    expect(html).toContain('data-monster-id="orc"');
    expect(html).toContain('>O</span>');
    expect(html).toContain('>Orc</span>');
  });

  it('matches longer monster names before shorter contained names', () => {
    const html = enrichMonsterMentionsHtml('Dragon King awaits. Dragon watches.');

    expect(html).toContain('data-monster-id="dragon-king"');
    expect(html).toContain('data-monster-id="dragon"');
    expect(html.indexOf('data-monster-id="dragon-king"')).toBeLessThan(
      html.indexOf('data-monster-id="dragon"')
    );
  });

  it('escapes plain text while preserving trusted styled item spans', () => {
    const html = enrichMonsterMentionsHtml(
      'Move onto stairs (< or >). Looted: <span style="color:red">Orc Blade</span>.'
    );

    expect(html).toContain('&lt; or &gt;');
    expect(html).toContain('<span style="color:red">');
    expect(html).toContain('Orc Blade');
  });
});
