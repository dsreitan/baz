import { describe, expect, it } from 'vitest';
import { STARTER_SPECIES } from '../data/index';
import { runBattleSim, runMatchup } from './sim';
import { createRng } from './rng';
import { createBattle } from './battle/engine';
import type { DinoInstance } from './types';

function starterDino(species: string, uid: string, level: number): DinoInstance {
  return {
    uid,
    species,
    nickname: species,
    level,
    xp: 0,
    quirk: { stat: 'hp', percent: 5 },
    trait: 'brawny',
    moves: undefined as unknown as string[], // filled below
    gear: {},
    appearanceSeed: 1,
    currentHpPercent: 1,
  };
}

describe('runBattleSim', () => {
  it('always terminates with a definite outcome', () => {
    const p = starterDino('emberfang', 'p1', 8);
    p.moves = ['ember_snap', 'magma_bite', 'molten_slam'];
    const config = {
      kind: 'wild' as const,
      playerDinos: [p],
      reserve: [],
      enemies: [
        {
          uid: 'e1',
          side: 'enemy' as const,
          species: 'cragmaul',
          nickname: 'Wild Cragmaul',
          level: 3,
          stage: 'juvenile' as const,
          stats: { hp: 40, atk: 10, def: 8, spd: 6 },
          currentHp: 40,
          shield: 0,
          statuses: [],
          cooldowns: {},
          moves: ['rock_smash'],
          trait: 'brawny',
          alphaMods: [],
          appearanceSeed: 1,
          tameable: true,
          fainted: false,
        },
      ],
      commands: [],
      skills: [],
      masterGear: {},
    };
    const result = runBattleSim(config, createRng(1));
    expect(['victory', 'defeat', 'fled']).toContain(result.outcome);
    expect(result.rounds).toBeGreaterThan(0);
  });

  it('createBattle + runBattleSim is deterministic for a fixed seed', () => {
    const build = () => {
      const p = starterDino('emberfang', 'p1', 8);
      p.moves = ['ember_snap', 'magma_bite'];
      return {
        kind: 'wild' as const,
        playerDinos: [p],
        reserve: [],
        enemies: [
          {
            uid: 'e1',
            side: 'enemy' as const,
            species: 'cragmaul',
            nickname: 'Wild Cragmaul',
            level: 3,
            stage: 'juvenile' as const,
            stats: { hp: 40, atk: 10, def: 8, spd: 6 },
            currentHp: 40,
            shield: 0,
            statuses: [],
            cooldowns: {},
            moves: ['rock_smash'],
            trait: 'brawny',
            alphaMods: [],
            appearanceSeed: 1,
            tameable: true,
            fainted: false,
          },
        ],
        commands: [],
        skills: [],
        masterGear: {},
      };
    };
    // createBattle is also exercised directly here to be sure sim wires it up identically each time.
    const s1 = createBattle(build(), createRng(99));
    const s2 = createBattle(build(), createRng(99));
    expect(s1.turnQueue).toEqual(s2.turnQueue);

    const r1 = runBattleSim(build(), createRng(42));
    const r2 = runBattleSim(build(), createRng(42));
    expect(r1.outcome).toBe(r2.outcome);
    expect(r1.rounds).toBe(r2.rounds);
    expect(r1.events).toEqual(r2.events);
  });
});

describe('runMatchup (balance sanity)', () => {
  it('a level-5 starter trio beats a level-3 wild pack at least 90% of the time over 50 sims', () => {
    const playerDinos: DinoInstance[] = STARTER_SPECIES.map((species, i) => {
      const dino = starterDino(species, `starter-${i}`, 5);
      dino.moves =
        species === 'emberfang'
          ? ['ember_snap', 'magma_bite']
          : species === 'thornback'
            ? ['leaf_razor', 'vine_trip', 'bulwark_stance']
            : ['leaf_razor', 'regrowth'];
      return dino;
    });

    // A "wild pack" of 3, mirroring the player's own trio size, at 2 levels below the player pack.
    const enemySpecs: { species: string; moves: string[] }[] = [
      { species: 'cragmaul', moves: ['rock_smash', 'boulder_toss'] },
      { species: 'bouldershell', moves: ['rock_smash', 'bulwark_stance'] },
      { species: 'voltspur', moves: ['spark_jab', 'arc_lash'] },
    ];
    const enemies = enemySpecs.map((spec, i) => ({
      uid: `wild-${i}`,
      side: 'enemy' as const,
      species: spec.species,
      nickname: spec.species,
      level: 3,
      stage: 'juvenile' as const,
      stats: { hp: 50, atk: 13, def: 11, spd: 10 },
      currentHp: 50,
      shield: 0,
      statuses: [],
      cooldowns: {},
      moves: spec.moves,
      trait: 'brawny',
      alphaMods: [],
      appearanceSeed: 1,
      tameable: true,
      fainted: false,
    }));

    const result = runMatchup(playerDinos, enemies, 50, 2024);
    expect(result.winRate).toBeGreaterThanOrEqual(0.9);
  });
});
