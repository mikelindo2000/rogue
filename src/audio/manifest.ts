/**
 * Local asset registry + event→asset resolution. Runtime code reads only from
 * this typed manifest; ElevenLabs and prompt notes live in
 * design/SOUND_EFFECT_ASSET_PROMPTS.md, never here.
 *
 * Resolution keeps combat/death cues generic at the event level and resolves
 * monster-specific clips via a most-specific-wins cascade:
 *   monsterId -> archetype -> special -> generic
 */
import type { SoundEvent } from './events';

export type Channel = 'combat' | 'status' | 'equipment' | 'item' | 'ui';

export interface SoundAsset {
  id: string;
  /** Files relative to AUDIO_BASE; the service randomizes between variants. */
  variants: string[];
  channel: Channel;
  /** Per-asset volume multiplier (0..1), applied under the global gain. */
  volume?: number;
  /** Minimum ms between plays of this asset (de-chatter noisy cues). */
  cooldownMs?: number;
  /** Max simultaneous voices for this asset. */
  maxVoices?: number;
  /** Higher wins when polyphony is contended. */
  priority?: number;
  /** Preload after unlock (core cues) vs lazy-load on first use (rare/boss). */
  preload?: boolean;
}

/** Public path prefix; Vite serves `public/audio/` at `/audio/`. */
export const AUDIO_BASE = '/audio/';

const sfx = (file: string) => `sfx/${file}`;

/** Every shipped asset, keyed by clip id. */
export const SOUND_ASSETS: Record<string, SoundAsset> = {
  // combat
  'combat-swing': { id: 'combat-swing', variants: [sfx('combat-swing-01.mp3')], channel: 'combat', volume: 0.5, cooldownMs: 60 },
  'combat-hit': { id: 'combat-hit', variants: [sfx('combat-hit-01.mp3')], channel: 'combat', volume: 0.9, cooldownMs: 70, maxVoices: 3, preload: true },
  'player-hit': { id: 'player-hit', variants: [sfx('player-hit-01.mp3')], channel: 'combat', volume: 0.95, cooldownMs: 120, preload: true },
  'combat-miss': { id: 'combat-miss', variants: [sfx('combat-miss-01.mp3')], channel: 'combat', volume: 0.7, cooldownMs: 80, preload: true },
  // death — generic + per-archetype + boss
  'death-default': { id: 'death-default', variants: [sfx('death-default-01.mp3')], channel: 'combat', volume: 0.9, preload: true },
  'death-skirmisher': { id: 'death-skirmisher', variants: [sfx('death-skirmisher-01.mp3')], channel: 'combat', volume: 0.9 },
  'death-ambusher': { id: 'death-ambusher', variants: [sfx('death-ambusher-01.mp3')], channel: 'combat', volume: 0.9 },
  'death-brute': { id: 'death-brute', variants: [sfx('death-brute-01.mp3')], channel: 'combat', volume: 0.95 },
  'death-kiter': { id: 'death-kiter', variants: [sfx('death-kiter-01.mp3')], channel: 'combat', volume: 0.9 },
  'death-trickster': { id: 'death-trickster', variants: [sfx('death-trickster-01.mp3')], channel: 'combat', volume: 0.9 },
  'death-bat': { id: 'death-bat', variants: [sfx('death-bat-01.mp3')], channel: 'combat', volume: 0.85 },
  'death-boss': { id: 'death-boss', variants: [sfx('death-boss-01.mp3')], channel: 'combat', volume: 1, priority: 10 },
  // player vitals & progression
  'player-levelup': { id: 'player-levelup', variants: [sfx('player-levelup-01.mp3')], channel: 'status', volume: 0.9, priority: 5 },
  'player-lowhealth': { id: 'player-lowhealth', variants: [sfx('player-lowhealth-01.mp3')], channel: 'status', volume: 0.8, cooldownMs: 1000 },
  'player-criticalhealth': { id: 'player-criticalhealth', variants: [sfx('player-criticalhealth-01.mp3')], channel: 'status', volume: 0.9, cooldownMs: 1000, priority: 6 },
  'player-death': { id: 'player-death', variants: [sfx('player-death-01.mp3')], channel: 'status', volume: 1, priority: 10 },
  // hunger / survival
  'hunger-hungry': { id: 'hunger-hungry', variants: [sfx('hunger-hungry-01.mp3')], channel: 'status', volume: 0.7, cooldownMs: 1500 },
  'hunger-fatigued': { id: 'hunger-fatigued', variants: [sfx('hunger-fatigued-01.mp3')], channel: 'status', volume: 0.75, cooldownMs: 1500 },
  'hunger-starving': { id: 'hunger-starving', variants: [sfx('hunger-starving-01.mp3')], channel: 'status', volume: 0.85, cooldownMs: 1500 },
  'hunger-starvetick': { id: 'hunger-starvetick', variants: [sfx('hunger-starvetick-01.mp3')], channel: 'status', volume: 0.55, cooldownMs: 1200 },
  // equipment
  'equip-weapon': { id: 'equip-weapon', variants: [sfx('equip-weapon-01.mp3')], channel: 'equipment', volume: 0.8, cooldownMs: 120 },
  'equip-armor': { id: 'equip-armor', variants: [sfx('equip-armor-01.mp3')], channel: 'equipment', volume: 0.8, cooldownMs: 120 },
  'equip-unequip': { id: 'equip-unequip', variants: [sfx('equip-unequip-01.mp3')], channel: 'equipment', volume: 0.75, cooldownMs: 120 },
  'equip-rejected': { id: 'equip-rejected', variants: [sfx('equip-rejected-01.mp3')], channel: 'equipment', volume: 0.7, cooldownMs: 150 },
  // items
  'item-pickup': { id: 'item-pickup', variants: [sfx('item-pickup-01.mp3')], channel: 'item', volume: 0.7, cooldownMs: 60, preload: true },
  'item-gold': { id: 'item-gold', variants: [sfx('item-gold-01.mp3')], channel: 'item', volume: 0.75, cooldownMs: 60 },
  'consume-potion': { id: 'consume-potion', variants: [sfx('consume-potion-01.mp3')], channel: 'item', volume: 0.8 },
  'consume-food': { id: 'consume-food', variants: [sfx('consume-food-01.mp3')], channel: 'item', volume: 0.8 },
  // map / navigation
  'stairs-down': { id: 'stairs-down', variants: [sfx('stairs-down-01.mp3')], channel: 'ui', volume: 0.8 },
  'stairs-up': { id: 'stairs-up', variants: [sfx('stairs-up-01.mp3')], channel: 'ui', volume: 0.8 },
  'secret-reveal': { id: 'secret-reveal', variants: [sfx('secret-reveal-01.mp3')], channel: 'ui', volume: 0.85 },
};

/** Per-archetype death clips (the cascade's middle tier). */
const DEATH_BY_ARCHETYPE: Record<string, string> = {
  skirmisher: 'death-skirmisher',
  ambusher: 'death-ambusher',
  brute: 'death-brute',
  kiter: 'death-kiter',
  trickster: 'death-trickster',
  bat: 'death-bat',
};

/** Resolve a death event's clip id via monsterId → archetype → special → generic. */
function resolveDeathClip(event: Extract<SoundEvent, { type: 'combat.death' }>): string {
  // (No per-monsterId overrides shipped yet; add them here when authored.)
  const byArchetype = DEATH_BY_ARCHETYPE[event.archetype];
  if (byArchetype) return byArchetype;
  if (event.special === 'boss' || event.special === 'hero') return 'death-boss';
  return 'death-default';
}

/** Map a domain event to the clip id that should play, or null for silence. */
export function resolveClipId(event: SoundEvent): string | null {
  switch (event.type) {
    case 'combat.swing': return 'combat-swing';
    case 'combat.hit': return event.target === 'player' ? 'player-hit' : 'combat-hit';
    case 'combat.miss': return 'combat-miss';
    case 'combat.death': return resolveDeathClip(event);
    case 'player.levelUp': return 'player-levelup';
    case 'player.lowHealth': return 'player-lowhealth';
    case 'player.criticalHealth': return 'player-criticalhealth';
    case 'player.death': return 'player-death';
    case 'hunger.hungry': return 'hunger-hungry';
    case 'hunger.fatigued': return 'hunger-fatigued';
    case 'hunger.starving': return 'hunger-starving';
    case 'hunger.starveTick': return 'hunger-starvetick';
    case 'equipment.equipWeapon': return 'equip-weapon';
    case 'equipment.equipArmor': return 'equip-armor';
    case 'equipment.unequipArmor': return 'equip-unequip';
    case 'equipment.rejected': return 'equip-rejected';
    case 'item.pickup': return event.kind === 'gold' ? 'item-gold' : 'item-pickup';
    case 'item.consume': return event.kind === 'potion' ? 'consume-potion' : 'consume-food';
    case 'map.stairs': return event.dir === 'down' ? 'stairs-down' : 'stairs-up';
    case 'map.secretReveal': return 'secret-reveal';
    default: return null;
  }
}

/** Resolve a domain event to its asset (with tuning), or null for silence. */
export function resolveCue(event: SoundEvent): SoundAsset | null {
  const id = resolveClipId(event);
  return id ? SOUND_ASSETS[id] ?? null : null;
}

// --- background music ---------------------------------------------------

/** Coarse game-state contexts that select a music bed. */
export type MusicContextId = 'explore-shallow' | 'explore-deep' | 'boss' | 'safe' | 'gameover';

/** Looping ~3-minute beds, one per context. Files relative to AUDIO_BASE. */
export const MUSIC_TRACKS: Record<MusicContextId, string> = {
  'explore-shallow': 'music/explore-shallow-01.mp3',
  'explore-deep': 'music/explore-deep-01.mp3',
  boss: 'music/boss-01.mp3',
  safe: 'music/safe-01.mp3',
  gameover: 'music/gameover-01.mp3',
};
