/* Declarative visual-effects registry. Pure data → presentation mapping, no DOM
   and no runes, so it can be unit tested and reused freely (mirrors format.ts).

   Components render the ordered list this produces; they do not decide whether
   the player is hungry, dying, or standing on a foggy floor. The survival layer
   is derived from survivalWarningView() in format.ts so thresholds live in one
   place. */

import { survivalWarningView, type SurvivalWarningTone } from './format';
import {
  chromeOverlayTextureByKey,
  chromeOverlayUrl,
  chromeOverlaysForFloor,
} from './chromeOverlays';

/** Where an effect renders. See the plan's stacking order:
 *  - `chrome`         — behind content in the top bar and side rails
 *  - `stage-backdrop` — between the rotating background image and the canvas
 *  - `stage-overlay`  — above the canvas (where the survival wash lives) */
export type VisualEffectTarget = 'chrome' | 'stage-backdrop' | 'stage-overlay';

export type VisualEffectKind =
  | 'floor-chrome-texture'
  | 'survival-hunger'
  | 'survival-health'
  | 'survival-both'
  | 'floor-green-fog'
  | 'floor-airy-light'
  | 'boss-tension';

export interface VisualEffectInstance {
  /** Stable key for Svelte's keyed each; unique within the active list. */
  id: string;
  kind: VisualEffectKind;
  target: VisualEffectTarget;
  /** Paint order within a target — lower renders first (behind). */
  layer: number;
  /** 0–1 strength, drives CSS alpha/pulse via `--fx-intensity`. */
  intensity: number;
  /** CSS class carrying the effect recipe (from effects.css). */
  className: string;
  /** CSS custom properties merged onto the layer element. Only `--*` keys are
   *  emitted by visualEffectStyle(); values come from this registry, never user
   *  input. */
  vars?: Record<string, string | number>;
}

export interface VisualEffectInput {
  floor: number;
  hp: number;
  maxHp: number;
  hunger: number;
  hungerFatigued: number;
  hungerHungry: number;
}

/** Paint layers, low → high. Atmosphere sits behind danger signaling. */
const LAYER = {
  chromeTexture: 1,
  floorFog: 10,
  bossTension: 15,
  survival: 20,
} as const;

/** Maps the survival warning tone to its effect kind/class. `none` has no
 *  layer. Health pulses faster, both fastest — encoded in the CSS classes. */
const SURVIVAL_KIND: Record<
  Exclude<SurvivalWarningTone, 'none'>,
  VisualEffectKind
> = {
  hunger: 'survival-hunger',
  health: 'survival-health',
  both: 'survival-both',
};

/** Floor → atmosphere rules. Keyed by floor number for V1; a future pass may
 *  move this into theme.ts so palette and atmosphere share a registry. Keep the
 *  table pure so it stays trivially testable. */
interface FloorEffectRule {
  id: string;
  floors: number[];
  kind: VisualEffectKind;
  /** Per-target opacity for the shared recipe — stage fog reads stronger than
   *  the faint chrome tint. */
  targets: { target: VisualEffectTarget; layer: number; opacity: number }[];
}

const FLOOR_EFFECTS: FloorEffectRule[] = [
  {
    // The Sunless Halls (1) — a light, airy glow on the chrome only.
    id: 'sunlit-airy',
    floors: [1],
    kind: 'floor-airy-light',
    targets: [{ target: 'chrome', layer: LAYER.floorFog, opacity: 0.4 }],
  },
  {
    // The Whispering Mire (11) and The Fungal Warrens (13) — dank green floors.
    id: 'verdant-fog',
    floors: [11, 13],
    kind: 'floor-green-fog',
    targets: [
      { target: 'stage-backdrop', layer: LAYER.floorFog, opacity: 0.5 },
      { target: 'chrome', layer: LAYER.floorFog, opacity: 0.12 },
    ],
  },
];

/** The CSS class for an effect kind (single source for class naming). */
function classFor(kind: VisualEffectKind): string {
  switch (kind) {
    case 'floor-chrome-texture':
      return 'fx-chrome-texture';
    case 'floor-green-fog':
      return 'fx-green-fog';
    case 'floor-airy-light':
      return 'fx-airy-light';
    default:
      return `fx-${kind}`;
  }
}

/** Build the ordered list of currently active visual effects for this frame. */
export function visualEffectLayers(input: VisualEffectInput): VisualEffectInstance[] {
  const effects: VisualEffectInstance[] = [];

  // Floor-specific chrome textures sit at the bottom of the chrome effect stack.
  // They are decorative, low opacity, and emitted from the same registry the
  // asset audit uses.
  for (const [index, overlay] of chromeOverlaysForFloor(input.floor).entries()) {
    const texture = chromeOverlayTextureByKey(overlay.textureKey);
    if (!texture) continue;
    effects.push({
      id: `chrome-texture-${texture.key}-${index}`,
      kind: 'floor-chrome-texture',
      target: 'chrome',
      layer: LAYER.chromeTexture + index,
      intensity: 1,
      className: classFor('floor-chrome-texture'),
      vars: {
        '--fx-opacity': overlay.opacity,
        '--fx-texture-url': `url("${chromeOverlayUrl(texture.file)}")`,
        '--fx-tile-size': `${overlay.tileSize}px`,
      },
    });
  }

  // Floor atmosphere (rendered behind the survival warning).
  for (const rule of FLOOR_EFFECTS) {
    if (!rule.floors.includes(input.floor)) continue;
    for (const t of rule.targets) {
      effects.push({
        id: `${rule.id}-${t.target}`,
        kind: rule.kind,
        target: t.target,
        layer: t.layer,
        intensity: 1,
        className: classFor(rule.kind),
        vars: { '--fx-intensity': 1, '--fx-opacity': t.opacity },
      });
    }
  }

  // Survival warning — reuses format.ts thresholds as the single source of truth.
  const survival = survivalWarningView({
    hp: input.hp,
    maxHp: input.maxHp,
    hunger: input.hunger,
    hungerFatigued: input.hungerFatigued,
    hungerHungry: input.hungerHungry,
  });
  if (survival.tone !== 'none') {
    const kind = SURVIVAL_KIND[survival.tone];
    effects.push({
      id: 'survival',
      kind,
      target: 'stage-overlay',
      layer: LAYER.survival,
      intensity: survival.intensity,
      className: classFor(kind),
      vars: { '--fx-intensity': survival.intensity },
    });
  }

  return effects;
}

/**
 * The crimson boss-tension vignette — a dark-red edge wash that breathes from
 * the screen edges, its pulse strength scaled by intensity. Computed apart from
 * visualEffectLayers because the boss state is derived from the map snapshot
 * (ChromePresenter.publishMap), not the HUD snapshot; the presenter merges this
 * onto the layer list. Returns null when no boss is engaged.
 */
export function bossTensionEffect(intensity: number): VisualEffectInstance | null {
  if (intensity <= 0) return null;
  const i = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  return {
    id: 'boss-tension',
    kind: 'boss-tension',
    target: 'stage-overlay',
    layer: LAYER.bossTension,
    intensity: i,
    className: classFor('boss-tension'),
    vars: { '--fx-intensity': i },
  };
}

/** Serialize an effect's CSS custom properties into a `style` string. Only
 *  `--*` keys are emitted; values originate in this registry, so the output is
 *  safe to bind into Svelte's `style` attribute. */
export function visualEffectStyle(effect: VisualEffectInstance): string {
  if (!effect.vars) return '';
  return Object.entries(effect.vars)
    .filter(([key]) => key.startsWith('--'))
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}
