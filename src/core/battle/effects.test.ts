import { describe, expect, it } from 'vitest';
import {
  applyStatus,
  cleanseNegativeStatuses,
  consumeCombo,
  effectiveStat,
  findStatus,
  statForStatKey,
  tickEndOfRoundStatuses,
} from './effects';
import { fixedRng, makeWildCombatant } from './testUtils';

describe('statForStatKey', () => {
  it('maps atk/def/spd to enrage/harden/slow, and hp to null', () => {
    expect(statForStatKey('atk')).toBe('enrage');
    expect(statForStatKey('def')).toBe('harden');
    expect(statForStatKey('spd')).toBe('slow');
    expect(statForStatKey('hp')).toBeNull();
  });
});

describe('applyStatus', () => {
  it('applies when the roll succeeds', () => {
    const target = makeWildCombatant('cragmaul');
    const result = applyStatus(target, 'burn', 2, 0.05, { chance: 1, rng: fixedRng(0) });
    expect(result).toEqual({ applied: true, refreshed: false });
    expect(findStatus(target, 'burn')).toEqual({ id: 'burn', turnsLeft: 2, power: 0.05 });
  });

  it('does not apply when the roll fails', () => {
    const target = makeWildCombatant('cragmaul');
    const result = applyStatus(target, 'burn', 2, 0.05, { chance: 0.1, rng: fixedRng(0.5) });
    expect(result.applied).toBe(false);
    expect(findStatus(target, 'burn')).toBeUndefined();
  });

  it('is blocked entirely when immune, regardless of chance', () => {
    const target = makeWildCombatant('cragmaul');
    const result = applyStatus(target, 'stun', 1, 0, { chance: 1, immune: true, rng: fixedRng(0) });
    expect(result.applied).toBe(false);
  });

  it('resist reduces the effective chance', () => {
    const target = makeWildCombatant('cragmaul');
    // chance 0.5, resist 60% -> effective chance 0.2; rng fixed at 0.3 fails only the resisted roll
    const result = applyStatus(target, 'poison', 2, 0.05, { chance: 0.5, resistPercent: 60, rng: fixedRng(0.3) });
    expect(result.applied).toBe(false);
  });

  it('refreshes turns/power when the status is already present (single slot per id)', () => {
    const target = makeWildCombatant('cragmaul');
    applyStatus(target, 'burn', 2, 0.05, { chance: 1, rng: fixedRng(0) });
    const result = applyStatus(target, 'burn', 5, 0.1, { chance: 1, rng: fixedRng(0) });
    expect(result).toEqual({ applied: true, refreshed: true });
    expect(target.statuses).toHaveLength(1);
    expect(findStatus(target, 'burn')).toEqual({ id: 'burn', turnsLeft: 5, power: 0.1 });
  });
});

describe('consumeCombo', () => {
  it('removes and returns a matching marker status', () => {
    const target = makeWildCombatant('cragmaul', { statuses: [{ id: 'chill', turnsLeft: 2, power: 0 }] });
    const removed = consumeCombo(target, 'chill');
    expect(removed).toEqual({ id: 'chill', turnsLeft: 2, power: 0 });
    expect(target.statuses).toHaveLength(0);
  });

  it('returns undefined when the status is absent', () => {
    const target = makeWildCombatant('cragmaul');
    expect(consumeCombo(target, 'soak')).toBeUndefined();
  });
});

describe('isNegativeStatus / cleanseNegativeStatuses', () => {
  it('removes DoTs, control statuses and combo markers, but keeps regen and positive harden/enrage/slow', () => {
    const target = makeWildCombatant('cragmaul', {
      statuses: [
        { id: 'burn', turnsLeft: 2, power: 0.05 },
        { id: 'soak', turnsLeft: 2, power: 0 },
        { id: 'regen', turnsLeft: 2, power: 0.08 },
        { id: 'harden', turnsLeft: 2, power: 0.2 }, // positive DEF buff — should stay
        { id: 'enrage', turnsLeft: 2, power: -0.2 }, // negative ATK debuff — should go
      ],
    });
    const removed = cleanseNegativeStatuses(target);
    expect(removed.sort()).toEqual(['burn', 'enrage', 'soak'].sort());
    const remainingIds = target.statuses.map((s) => s.id).sort();
    expect(remainingIds).toEqual(['harden', 'regen']);
  });
});

describe('effectiveStat', () => {
  it('returns the base stat when no relevant status is active', () => {
    const c = makeWildCombatant('cragmaul');
    expect(effectiveStat(c, 'atk')).toBe(c.stats.atk);
  });

  it('applies a positive harden to DEF', () => {
    const c = makeWildCombatant('cragmaul', { statuses: [{ id: 'harden', turnsLeft: 2, power: 0.5 }] });
    expect(effectiveStat(c, 'def')).toBe(Math.round(c.stats.def * 1.5));
  });

  it('applies a negative enrage (debuff) to ATK', () => {
    const c = makeWildCombatant('cragmaul', { statuses: [{ id: 'enrage', turnsLeft: 2, power: -0.2 }] });
    expect(effectiveStat(c, 'atk')).toBe(Math.round(c.stats.atk * 0.8));
  });

  it('never drops below 1', () => {
    const c = makeWildCombatant('cragmaul', { statuses: [{ id: 'slow', turnsLeft: 2, power: -0.99 }] });
    expect(effectiveStat(c, 'spd')).toBeGreaterThanOrEqual(1);
  });

  it('HP is never modified by status', () => {
    const c = makeWildCombatant('cragmaul', { statuses: [{ id: 'harden', turnsLeft: 2, power: 0.9 }] });
    expect(effectiveStat(c, 'hp')).toBe(c.stats.hp);
  });
});

describe('tickEndOfRoundStatuses', () => {
  it('deals DoT damage as a percent of max HP and emits statusTick', () => {
    const c = makeWildCombatant('cragmaul', { statuses: [{ id: 'poison', turnsLeft: 2, power: 0.1 }] });
    const before = c.currentHp;
    const events = tickEndOfRoundStatuses(c);
    const expected = Math.max(1, Math.round(c.stats.hp * 0.1));
    expect(c.currentHp).toBe(before - expected);
    expect(events).toContainEqual({ e: 'statusTick', uid: c.uid, status: 'poison', amount: expected });
  });

  it('heals via regen, capped at max HP, and emits heal', () => {
    const c = makeWildCombatant('cragmaul', { currentHp: 1, statuses: [{ id: 'regen', turnsLeft: 2, power: 0.5 }] });
    const events = tickEndOfRoundStatuses(c);
    expect(c.currentHp).toBeGreaterThan(1);
    expect(c.currentHp).toBeLessThanOrEqual(c.stats.hp);
    expect(events.some((e) => e.e === 'heal')).toBe(true);
  });

  it('faints the combatant if DoT damage brings HP to 0', () => {
    const c = makeWildCombatant('cragmaul', { currentHp: 1, statuses: [{ id: 'burn', turnsLeft: 2, power: 0.5 }] });
    const events = tickEndOfRoundStatuses(c);
    expect(c.fainted).toBe(true);
    expect(events).toContainEqual({ e: 'faint', uid: c.uid });
  });

  it('decrements turnsLeft and expires statuses that reach 0, emitting statusExpired', () => {
    const c = makeWildCombatant('cragmaul', { statuses: [{ id: 'chill', turnsLeft: 1, power: 0 }] });
    const events = tickEndOfRoundStatuses(c);
    expect(c.statuses).toHaveLength(0);
    expect(events).toContainEqual({ e: 'statusExpired', uid: c.uid, status: 'chill' });
  });

  it('keeps a status with turnsLeft > 1, decremented by exactly 1', () => {
    const c = makeWildCombatant('cragmaul', { statuses: [{ id: 'chill', turnsLeft: 3, power: 0 }] });
    tickEndOfRoundStatuses(c);
    expect(findStatus(c, 'chill')?.turnsLeft).toBe(2);
  });

  it('is a no-op for a fainted combatant', () => {
    const c = makeWildCombatant('cragmaul', { fainted: true, statuses: [{ id: 'poison', turnsLeft: 2, power: 0.1 }] });
    const events = tickEndOfRoundStatuses(c);
    expect(events).toHaveLength(0);
    expect(c.statuses).toHaveLength(1);
  });
});
