import { describe, expect, it } from 'vitest';
import { gearArtUrl, inventoryArtName } from './inventoryArt';
import { POTION_TYPES, POTION_VISUALS, potionVisual } from '../itemVisuals';

describe('inventory art URLs', () => {
  it('uses base gear names when generated gear has a floor bonus suffix', () => {
    expect(inventoryArtName('Fire Staff +1')).toBe('Fire Staff');
    expect(gearArtUrl({ name: 'Cloth Shirt +1', def: 3, maxDef: 3 })).toBe('/inventory/cloth-shirt.png');
    expect(gearArtUrl({ name: 'Platemail +12', def: 14, maxDef: 14 })).toBe('/inventory/platemail.png');
  });

  it('keeps every potion wired to distinct visual metadata', () => {
    const icons = new Set<string>();
    const mapColors = new Set<string>();

    for (const type of POTION_TYPES) {
      const visual = potionVisual(type);
      icons.add(visual.icon);
      mapColors.add(visual.mapColor);
      expect(POTION_VISUALS[type]).toBe(visual);
      expect(visual.icon).toBe(`potion-${type}`);
      expect(visual.uiColor).toContain(`--potion-${type}`);
    }

    expect(icons.size).toBe(POTION_TYPES.length);
    expect(mapColors.size).toBe(POTION_TYPES.length);
  });
});
