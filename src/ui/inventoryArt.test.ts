import { describe, expect, it } from 'vitest';
import { gearArtUrl, inventoryArtName } from './inventoryArt';

describe('inventory art URLs', () => {
  it('uses base gear names when generated gear has a floor bonus suffix', () => {
    expect(inventoryArtName('Fire Staff +1')).toBe('Fire Staff');
    expect(gearArtUrl({ name: 'Cloth Shirt +1', def: 3, maxDef: 3 })).toBe('/inventory/cloth-shirt.png');
    expect(gearArtUrl({ name: 'Platemail +12', def: 14, maxDef: 14 })).toBe('/inventory/platemail.png');
  });
});
