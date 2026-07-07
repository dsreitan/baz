/**
 * Status application/expiry/tick + combo-state consumption helpers used by
 * the battle engine (ARCHITECTURE §5).
 *
 * Design decision (StatusId is a closed vocabulary — see types.ts): generic
 * `MoveEffect` buff/debuff on a stat has no dedicated StatusId, so it is
 * represented using the three stat-modifying statuses called out by the
 * `ActiveStatus.power` doc comment ("stat fraction for harden/enrage/slow"):
 *   atk -> 'enrage', def -> 'harden', spd -> 'slow'
 * `power` is a *signed* fraction: positive = buff, negative = debuff. This
 * is why "Slow" can also represent Tailwind's speed buff — there is no
 * separate "Haste" status in the closed vocabulary. Documented in the
 * Phase 3 report as load-bearing interpretation of a genuinely ambiguous
 * contract point.
 *
 * All statuses are single-slot per id per combatant: re-applying an id
 * overwrites turns/power rather than stacking multiple instances, matching
 * the brief ("applyStatus rolls chance, refreshes duration if present").
 */
import type { ActiveStatus, BattleEvent, Combatant, Rng, StatKey, StatusId } from '../types';

export function statForStatKey(stat: StatKey): StatusId | null {
  if (stat === 'atk') return 'enrage';
  if (stat === 'def') return 'harden';
  if (stat === 'spd') return 'slow';
  return null; // no stat-modifying status exists for hp
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function findStatus(target: Combatant, id: StatusId): ActiveStatus | undefined {
  return target.statuses.find((s) => s.id === id);
}

export interface ApplyStatusOptions {
  chance: number;
  /** whole-number percent, e.g. from a statusResist trait */
  resistPercent?: number;
  /** alphaMod `statusImmune` (bulwark) blocks every status application unconditionally */
  immune?: boolean;
  rng: Rng;
}

export interface ApplyStatusResult {
  applied: boolean;
  refreshed: boolean;
}

/** Roll chance (mitigated by resist), then apply or refresh a status on `target`. */
export function applyStatus(
  target: Combatant,
  status: StatusId,
  turns: number,
  power: number,
  opts: ApplyStatusOptions,
): ApplyStatusResult {
  if (opts.immune) return { applied: false, refreshed: false };
  const resist = opts.resistPercent ?? 0;
  const effectiveChance = clamp01(opts.chance * (1 - resist / 100));
  if (!opts.rng.chance(effectiveChance)) return { applied: false, refreshed: false };

  const existing = findStatus(target, status);
  if (existing) {
    existing.turnsLeft = turns;
    existing.power = power;
    return { applied: true, refreshed: true };
  }
  target.statuses.push({ id: status, turnsLeft: turns, power });
  return { applied: true, refreshed: false };
}

/** Remove and return the named status if present (combo consumption); undefined if absent. */
export function consumeCombo(target: Combatant, status: StatusId): ActiveStatus | undefined {
  const idx = target.statuses.findIndex((s) => s.id === status);
  if (idx === -1) return undefined;
  const [removed] = target.statuses.splice(idx, 1);
  return removed;
}

const ALWAYS_NEGATIVE: ReadonlySet<StatusId> = new Set([
  'burn',
  'poison',
  'bleed',
  'stun',
  'taunt',
  'soak',
  'chill',
  'knockdown',
  'charged',
]);

/** Combo marker states count as "negative" for cleanse purposes: they exist to be exploited by the opponent. */
export function isNegativeStatus(status: ActiveStatus): boolean {
  if (ALWAYS_NEGATIVE.has(status.id)) return true;
  if (status.id === 'harden' || status.id === 'enrage' || status.id === 'slow') return status.power < 0;
  return false; // regen is always beneficial
}

/** Remove every negative status from `target`; returns the removed status ids. */
export function cleanseNegativeStatuses(target: Combatant): StatusId[] {
  const removed: StatusId[] = [];
  target.statuses = target.statuses.filter((s) => {
    if (isNegativeStatus(s)) {
      removed.push(s.id);
      return false;
    }
    return true;
  });
  return removed;
}

/**
 * Effective value of a stat after harden/enrage/slow modifiers (guard is
 * implemented as a 1-turn `harden` — see engine.ts). HP is never modified by
 * status (only `currentHp`/`shield` change, handled elsewhere).
 */
export function effectiveStat(combatant: Combatant, stat: StatKey): number {
  const base = combatant.stats[stat];
  if (stat === 'hp') return base;
  const statusId = statForStatKey(stat);
  if (!statusId) return base;
  let percentSum = 0;
  for (const status of combatant.statuses) {
    if (status.id === statusId) percentSum += status.power * 100;
  }
  return Math.max(1, Math.round(base * (1 + percentSum / 100)));
}

/**
 * End-of-round tick for one combatant: DoT damage (burn/poison/bleed),
 * regen heal, then turnsLeft decrement + expiry for every active status.
 * Mutates `target` in place and returns the events describing what happened.
 */
export function tickEndOfRoundStatuses(target: Combatant): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (target.fainted) return events;
  const maxHp = target.stats.hp;

  for (const status of target.statuses) {
    if (status.id === 'burn' || status.id === 'poison' || status.id === 'bleed') {
      const amount = Math.max(1, Math.round(maxHp * status.power));
      target.currentHp = Math.max(0, target.currentHp - amount);
      events.push({ e: 'statusTick', uid: target.uid, status: status.id, amount });
      if (target.currentHp <= 0) {
        target.fainted = true;
        events.push({ e: 'faint', uid: target.uid });
      }
    } else if (status.id === 'regen') {
      const before = target.currentHp;
      target.currentHp = Math.min(maxHp, target.currentHp + Math.max(1, Math.round(maxHp * status.power)));
      const healed = target.currentHp - before;
      if (healed > 0) events.push({ e: 'heal', uid: target.uid, amount: healed });
    }
    if (target.fainted) break;
  }

  const remaining: ActiveStatus[] = [];
  for (const status of target.statuses) {
    const turnsLeft = status.turnsLeft - 1;
    if (turnsLeft <= 0) {
      events.push({ e: 'statusExpired', uid: target.uid, status: status.id });
    } else {
      remaining.push({ ...status, turnsLeft });
    }
  }
  target.statuses = remaining;

  return events;
}
