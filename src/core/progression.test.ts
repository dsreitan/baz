import { describe, expect, it } from 'vitest';
import { SPECIES } from '../data/index';
import {
  canUnlockSkill,
  grantBattleXp,
  grantMasterXp,
  masterXpForLevel,
  newlyLearnableMoves,
  xpForLevel,
} from './progression';
import { stageForLevel } from './stats';
import type { DinoInstance, PackmasterState } from './types';

function makeDino(overrides: Partial<DinoInstance> = {}): DinoInstance {
  return {
    uid: overrides.uid ?? 'd1',
    species: 'emberfang',
    nickname: 'Test',
    level: 1,
    xp: 0,
    quirk: { stat: 'hp', percent: 5 },
    trait: 'brawny',
    moves: ['ember_snap'],
    gear: {},
    appearanceSeed: 1,
    currentHpPercent: 1,
    ...overrides,
  };
}

describe('xpForLevel / masterXpForLevel', () => {
  it('is monotonically increasing', () => {
    for (let level = 1; level < 29; level++) {
      expect(xpForLevel(level + 1)).toBeGreaterThan(xpForLevel(level));
    }
    for (let level = 1; level < 19; level++) {
      expect(masterXpForLevel(level + 1)).toBeGreaterThan(masterXpForLevel(level));
    }
  });

  it('is always positive', () => {
    expect(xpForLevel(1)).toBeGreaterThan(0);
    expect(masterXpForLevel(1)).toBeGreaterThan(0);
  });
});

describe('newlyLearnableMoves', () => {
  it('returns only moves strictly between fromLevel (exclusive) and toLevel (inclusive)', () => {
    const species = SPECIES['emberfang']!;
    const learned = newlyLearnableMoves(species, 1, 7);
    // emberfang learnset: 1 ember_snap, 4 magma_bite, 7 molten_slam, ...
    expect(learned).toEqual(['magma_bite', 'molten_slam']);
    expect(newlyLearnableMoves(species, 7, 7)).toEqual([]);
  });
});

describe('grantBattleXp', () => {
  it('grants full Xp to every active participant', () => {
    const a = makeDino({ uid: 'a' });
    const b = makeDino({ uid: 'b' });
    const result = grantBattleXp({ active: [a, b], reserve: [], defeatedEnemyLevels: [5], skills: [] });
    expect(result.xpAwarded['a']).toBe(result.xpAwarded['b']);
    expect(result.xpAwarded['a']).toBeGreaterThan(0);
  });

  it('grants 0 XP to reserve dinos without a benchXpShare skill', () => {
    const active = makeDino({ uid: 'a' });
    const bench = makeDino({ uid: 'bench' });
    const result = grantBattleXp({ active: [active], reserve: [bench], defeatedEnemyLevels: [5], skills: [] });
    expect(result.xpAwarded['bench']).toBeUndefined();
    expect(bench.xp).toBe(0);
  });

  it('grants a percentage share to reserve dinos with a benchXpShare skill', () => {
    const active = makeDino({ uid: 'a' });
    const bench = makeDino({ uid: 'bench' });
    const result = grantBattleXp({
      active: [active],
      reserve: [bench],
      defeatedEnemyLevels: [5],
      skills: ['handler_mentor'], // benchXpShare 25%
    });
    expect(result.xpAwarded['bench']).toBe(Math.round(result.xpAwarded['a']! * 0.25));
  });

  it('applies multi-level level-ups safely in one call', () => {
    const dino = makeDino({ uid: 'a', level: 1, xp: 0 });
    const result = grantBattleXp({ active: [dino], reserve: [], defeatedEnemyLevels: [30, 30, 30, 30], skills: [] });
    expect(dino.level).toBeGreaterThan(1);
    expect(result.levelUps.length).toBe(dino.level - 1);
    // Every intermediate level transition should appear exactly once, in order.
    for (let i = 0; i < result.levelUps.length; i++) {
      expect(result.levelUps[i]).toEqual({ uid: 'a', fromLevel: i + 1, toLevel: i + 2 });
    }
  });

  it('emits a maturation event when crossing the adult/alpha thresholds', () => {
    const dino = makeDino({ uid: 'a', level: 9, xp: 0 });
    const result = grantBattleXp({ active: [dino], reserve: [], defeatedEnemyLevels: [30], skills: [] });
    if (dino.level >= 10) {
      expect(result.maturations).toContainEqual({ uid: 'a', stage: stageForLevel(dino.level) });
    }
  });

  it('reports newly learnable moves for a dino that leveled up', () => {
    const dino = makeDino({ uid: 'a', species: 'emberfang', level: 1, xp: 0 });
    const result = grantBattleXp({ active: [dino], reserve: [], defeatedEnemyLevels: [30, 30], skills: [] });
    expect(dino.level).toBeGreaterThan(1);
    expect(result.newlyLearnable['a']).toBeDefined();
    expect(result.newlyLearnable['a']!.length).toBeGreaterThan(0);
  });

  it('never levels past DINO_MAX_LEVEL', () => {
    const dino = makeDino({ uid: 'a', level: 29, xp: 0 });
    grantBattleXp({ active: [dino], reserve: [], defeatedEnemyLevels: Array(200).fill(30), skills: [] });
    expect(dino.level).toBe(30);
    expect(dino.xp).toBe(0);
  });
});

describe('grantMasterXp', () => {
  function makeMaster(overrides: Partial<PackmasterState> = {}): PackmasterState {
    return { name: 'Test', level: 1, xp: 0, skillPoints: 0, skills: [], gear: {}, ...overrides };
  }

  it('levels up and grants skill points', () => {
    const master = makeMaster();
    const result = grantMasterXp(master, masterXpForLevel(1) + 1);
    expect(master.level).toBe(2);
    expect(result.levelsGained).toBe(1);
    expect(result.skillPointsGained).toBe(1);
    expect(master.skillPoints).toBe(1);
  });

  it('never levels past MASTER_MAX_LEVEL', () => {
    const master = makeMaster({ level: 19, xp: 0 });
    grantMasterXp(master, 1_000_000);
    expect(master.level).toBe(20);
  });
});

describe('canUnlockSkill', () => {
  it('tier 1 nodes are always unlockable', () => {
    expect(canUnlockSkill([], 'tactician_lure')).toBe(true);
  });

  it('tier 2+ requires an owned tier-(n-1) node in the same branch', () => {
    expect(canUnlockSkill([], 'tactician_recall')).toBe(false); // tier 2, nothing owned
    expect(canUnlockSkill(['tactician_lure'], 'tactician_recall')).toBe(true); // tier 1 owned in same branch
    expect(canUnlockSkill(['handler_soothing_presence'], 'tactician_recall')).toBe(false); // wrong branch
  });

  it('tier 3 requires a tier-2 node, not just any tier-1 node', () => {
    expect(canUnlockSkill(['tactician_lure'], 'tactician_focus')).toBe(false);
    expect(canUnlockSkill(['tactician_lure', 'tactician_recall'], 'tactician_focus')).toBe(true);
  });

  it('already-owned skills cannot be unlocked again', () => {
    expect(canUnlockSkill(['tactician_lure'], 'tactician_lure')).toBe(false);
  });
});
