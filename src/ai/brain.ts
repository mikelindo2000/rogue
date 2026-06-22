/* Behavior interpreter — pure intent generation.
 *
 * `decideMonsterAction` reads a monster, its behavior, and the world, and
 * returns one `AIAction`. It mutates nothing except drawing from the injected
 * RNG (deterministic), so it's trivially unit-testable and runs identically
 * headless (for the balancer) or live (in the engine).
 *
 * Parity contract: a monster on the `default` archetype must decide exactly
 * what the legacy processMonsterAI did — stationary outside aggro, step toward
 * the player (X then Y) inside it, attack when orthogonally adjacent, and wander
 * while the player is invisible. The default path also draws from the RNG in the
 * same order, so seeded games stay reproducible.
 */

import { isWalkable } from '../tiles';
import { BALANCE } from '../config';
import type { Monster } from '../types';
import type { AIAction, AttackSpec, BrainContext, MonsterAIRuntime } from './types';

const CARDINALS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

const manhattan = (ax: number, ay: number, bx: number, by: number) =>
  Math.abs(ax - bx) + Math.abs(ay - by);

/** Lazily attach and return a monster's AI runtime state. */
export function ensureRuntime(m: Monster): MonsterAIRuntime {
  if (!m.ai) {
    m.ai = { state: 'asleep', cooldowns: {}, swipeToggle: false };
  }
  return m.ai;
}

function occupied(monsters: Monster[], x: number, y: number, self: Monster): boolean {
  return monsters.some((o) => o !== self && o.x === x && o.y === y);
}

function canStep(ctx: BrainContext, x: number, y: number): boolean {
  return (
    x >= 0 &&
    x < ctx.cols &&
    y >= 0 &&
    y < ctx.rows &&
    isWalkable(ctx.map[y]?.[x]) &&
    !occupied(ctx.monsters, x, y, ctx.monster)
  );
}

/** Legacy chase: try the horizontal step first, then the vertical. */
function stepToward(ctx: BrainContext, tx: number, ty: number): AIAction {
  const { monster: m } = ctx;
  const sx = m.x + Math.sign(tx - m.x);
  const sy = m.y + Math.sign(ty - m.y);
  if (sx !== m.x && canStep(ctx, sx, m.y)) return { type: 'move', dx: sx - m.x, dy: 0 };
  if (sy !== m.y && canStep(ctx, m.x, sy)) return { type: 'move', dx: 0, dy: sy - m.y };
  return { type: 'wait' };
}

/** Step directly away from a point (used by fleeing / kiting). */
function stepAway(ctx: BrainContext, tx: number, ty: number): AIAction {
  const { monster: m } = ctx;
  const sx = m.x - Math.sign(tx - m.x);
  const sy = m.y - Math.sign(ty - m.y);
  // Prefer the axis of greatest separation gain; fall back to the other.
  const dxFirst = Math.abs(tx - m.x) >= Math.abs(ty - m.y);
  const tryX = (): AIAction | null => (sx !== m.x && canStep(ctx, sx, m.y) ? { type: 'move', dx: sx - m.x, dy: 0 } : null);
  const tryY = (): AIAction | null => (sy !== m.y && canStep(ctx, m.x, sy) ? { type: 'move', dx: 0, dy: sy - m.y } : null);
  const a = dxFirst ? tryX() ?? tryY() : tryY() ?? tryX();
  return a ?? { type: 'wait' };
}

/** Legacy wander: 40% chance to skip, else one random cardinal if walkable.
 *  Draws rng.chance then rng.pick, matching the original order. */
function wander(ctx: BrainContext): AIAction {
  if (ctx.rng.chance(BALANCE.monster.wanderSkipChance)) return { type: 'wait' };
  const d = ctx.rng.pick(CARDINALS);
  if (!d) return { type: 'wait' };
  return canStep(ctx, ctx.monster.x + d.x, ctx.monster.y + d.y)
    ? { type: 'move', dx: d.x, dy: d.y }
    : { type: 'wait' };
}

function attackReady(rt: MonsterAIRuntime, a: AttackSpec, turn: number): boolean {
  const ready = rt.cooldowns[a.id] ?? -Infinity;
  return turn >= ready;
}

/** Pick the highest-weight eligible attack whose range covers `dist`. */
function chooseAttack(ctx: BrainContext, dist: number): AttackSpec | null {
  const rt = ensureRuntime(ctx.monster);
  const eligible = ctx.behavior.attacks
    .filter((a) => dist <= a.range && attackReady(rt, a, ctx.turn))
    .sort((a, b) => b.weight - a.weight);
  return eligible[0] ?? null;
}

/**
 * Decide one monster's action for this turn. Pure aside from RNG draws.
 */
export function decideMonsterAction(ctx: BrainContext): AIAction {
  const { monster: m, player, behavior } = ctx;
  const rt = ensureRuntime(m);

  // While the player is invisible, every monster loses the scent and wanders —
  // exactly the legacy behavior, RNG order preserved.
  if (ctx.status.invisTurns > 0) return wander(ctx);

  const dist = manhattan(m.x, m.y, player.x, player.y);

  // On-hit abilities can flip the monster into a fleeing state; honor it.
  const fleeBelow = behavior.defense.fleeBelowHpPct;
  const maxHp = m.maxHp ?? m.hp;
  if (fleeBelow !== undefined && m.hp <= maxHp * fleeBelow) rt.state = 'fleeing';
  if (rt.state === 'fleeing') {
    // A cornered fleer with nowhere to run still bites if you're on top of it.
    const away = stepAway(ctx, player.x, player.y);
    if (away.type === 'move') return away;
    const a = chooseAttack(ctx, dist);
    return a ? { type: 'attack', attackId: a.id } : { type: 'wait' };
  }

  // Kiters value spacing over a free shot: if the player has closed inside the
  // preferred range and there's room to retreat, back off instead of attacking.
  if (behavior.movement.style === 'kite') {
    const keep = behavior.movement.keepDistance ?? 3;
    if (dist >= 1 && dist < keep) {
      const away = stepAway(ctx, player.x, player.y);
      if (away.type === 'move') return away;
    }
  }

  // Attack if anything is in range.
  const attack = chooseAttack(ctx, dist);
  if (attack && dist <= attack.range && dist >= 1) {
    return { type: 'attack', attackId: attack.id };
  }

  // Otherwise move according to the movement style.
  return decideMovement(ctx, dist);
}

function decideMovement(ctx: BrainContext, dist: number): AIAction {
  const { monster: m, player, behavior } = ctx;
  const mv = behavior.movement;
  const rt = ensureRuntime(m);

  switch (mv.style) {
    case 'stationary':
      return { type: 'wait' };

    case 'hunt':
      // Stationary outside aggro, chase within — the legacy rule.
      return dist < mv.aggroRange ? stepToward(ctx, player.x, player.y) : { type: 'wait' };

    case 'ambush': {
      const wake = mv.wakeRange ?? mv.aggroRange;
      if (rt.state !== 'hunting') {
        if (dist <= wake) rt.state = 'hunting';
        else return { type: 'wait' };
      }
      return stepToward(ctx, player.x, player.y);
    }

    case 'erratic':
      if (dist >= mv.aggroRange) return { type: 'wait' };
      // Wobble: sometimes a random hop instead of a perfect chase step.
      if (ctx.rng.chance(mv.erraticChance ?? 0.5)) {
        const d = ctx.rng.pick(CARDINALS);
        return canStep(ctx, m.x + d.x, m.y + d.y)
          ? { type: 'move', dx: d.x, dy: d.y }
          : stepToward(ctx, player.x, player.y);
      }
      return stepToward(ctx, player.x, player.y);

    case 'kite': {
      if (dist >= mv.aggroRange) return { type: 'wait' };
      const keep = mv.keepDistance ?? 3;
      if (dist < keep) return stepAway(ctx, player.x, player.y);
      if (dist > keep) return stepToward(ctx, player.x, player.y);
      return { type: 'wait' }; // at preferred range, hold (and attack next check)
    }

    case 'flee':
      return stepAway(ctx, player.x, player.y);
  }
}
