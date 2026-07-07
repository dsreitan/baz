import { describe, expect, it } from 'vitest';
import { TAME_CHANCE_MAX, TAME_CHANCE_MIN, TAME_HP_ELIGIBLE_THRESHOLD } from '../balance';
import { resolveTame, tameChance, type TameContext } from './taming';
import { fixedRng, makeWildCombatant } from './testUtils';

const neutralCtx: TameContext = { lureActive: false, skillTameChancePercent: 0, affixTameChancePercent: 0 };

describe('tameChance', () => {
  it('is 0 when the target is at/above the eligibility threshold', () => {
    const target = makeWildCombatant('cragmaul');
    target.currentHp = Math.ceil(target.stats.hp * TAME_HP_ELIGIBLE_THRESHOLD);
    expect(tameChance(target, neutralCtx)).toBe(0);
  });

  it('increases as HP fraction drops (monotonicity)', () => {
    const target = makeWildCombatant('cragmaul');
    target.currentHp = Math.round(target.stats.hp * 0.3);
    const chanceAt30 = tameChance(target, neutralCtx);
    target.currentHp = Math.round(target.stats.hp * 0.1);
    const chanceAt10 = tameChance(target, neutralCtx);
    target.currentHp = 0;
    const chanceAt0 = tameChance(target, neutralCtx);
    expect(chanceAt10).toBeGreaterThan(chanceAt30);
    expect(chanceAt0).toBeGreaterThan(chanceAt10);
  });

  it('a harder-to-tame species has a lower chance at the same HP fraction', () => {
    // riverjaw tameDifficulty 1.0, runeclaw 1.3 (harder)
    const easy = makeWildCombatant('riverjaw');
    const hard = makeWildCombatant('runeclaw');
    easy.currentHp = Math.round(easy.stats.hp * 0.1);
    hard.currentHp = Math.round(hard.stats.hp * 0.1);
    expect(tameChance(hard, neutralCtx)).toBeLessThan(tameChance(easy, neutralCtx));
  });

  it('lure, skills and affixes all raise the chance', () => {
    const target = makeWildCombatant('cragmaul');
    target.currentHp = Math.round(target.stats.hp * 0.2);
    const base = tameChance(target, neutralCtx);
    const withLure = tameChance(target, { ...neutralCtx, lureActive: true });
    const withSkill = tameChance(target, { ...neutralCtx, skillTameChancePercent: 25 });
    const withAffix = tameChance(target, { ...neutralCtx, affixTameChancePercent: 10 });
    expect(withLure).toBeGreaterThan(base);
    expect(withSkill).toBeGreaterThan(base);
    expect(withAffix).toBeGreaterThan(base);
  });

  it('grants a flat bonus for chill/stun statuses', () => {
    const target = makeWildCombatant('cragmaul');
    target.currentHp = Math.round(target.stats.hp * 0.2);
    const base = tameChance(target, neutralCtx);
    target.statuses.push({ id: 'chill', turnsLeft: 2, power: 0 });
    expect(tameChance(target, neutralCtx)).toBeGreaterThan(base);
  });

  it('is clamped to [TAME_CHANCE_MIN, TAME_CHANCE_MAX]', () => {
    const target = makeWildCombatant('cragmaul');
    target.currentHp = 0;
    const maxed = tameChance(target, { lureActive: true, skillTameChancePercent: 200, affixTameChancePercent: 200 });
    expect(maxed).toBeLessThanOrEqual(TAME_CHANCE_MAX);
    target.currentHp = Math.round(target.stats.hp * 0.34);
    const minned = tameChance(target, neutralCtx);
    expect(minned).toBeGreaterThanOrEqual(TAME_CHANCE_MIN);
  });
});

describe('resolveTame', () => {
  it('reports success and does not enrage when the roll succeeds', () => {
    const target = makeWildCombatant('cragmaul');
    target.currentHp = 1;
    const result = resolveTame(target, neutralCtx, fixedRng(0), false);
    expect(result.success).toBe(true);
    expect(result.enraged).toBe(false);
    expect(target.statuses).toHaveLength(0);
  });

  it('applies enrage on failure', () => {
    const target = makeWildCombatant('cragmaul');
    target.currentHp = Math.round(target.stats.hp * 0.3);
    const result = resolveTame(target, neutralCtx, fixedRng(0.999999), false);
    expect(result.success).toBe(false);
    expect(result.enraged).toBe(true);
    expect(target.statuses.find((s) => s.id === 'enrage')).toBeDefined();
  });

  it('lure_of_the_wilds suppresses enrage on failure', () => {
    const target = makeWildCombatant('cragmaul');
    target.currentHp = Math.round(target.stats.hp * 0.3);
    const result = resolveTame(target, neutralCtx, fixedRng(0.999999), true);
    expect(result.success).toBe(false);
    expect(result.enraged).toBe(false);
    expect(target.statuses).toHaveLength(0);
  });
});
