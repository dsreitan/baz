/**
 * Wiring test: generateEncounter output must be directly usable as
 * `CreateBattleConfig.enemies`, and a full headless sim against it must
 * terminate (ARCHITECTURE §8 "generation... property tests"; this is the
 * one integration point the Phase 4 brief calls out explicitly).
 */
import { describe, expect, it } from 'vitest';
import { makeDino } from '../battle/testUtils';
import { createRng } from '../rng';
import { runBattleSim } from '../sim';
import { generateEncounter } from './dino';
import { generateExpedition, visitNode } from './expedition';
import type { CreateBattleConfig } from '../battle/engine';

describe('gen -> engine -> sim integration', () => {
  it('a generated battle encounter feeds createBattle/runBattleSim to a definite outcome', () => {
    for (let seed = 0; seed < 25; seed++) {
      const enemies = generateEncounter({
        biome: 'cinder_peaks',
        tier: 1,
        packAvgLevel: 6,
        packSize: 2,
        kind: 'battle',
        rng: createRng(seed),
      });
      const config: CreateBattleConfig = {
        kind: 'wild',
        playerDinos: [makeDino('emberfang', { level: 6 }), makeDino('thornback', { level: 6 })],
        reserve: [],
        enemies,
        commands: [],
        skills: [],
        masterGear: {},
      };
      const result = runBattleSim(config, createRng(seed + 1000));
      expect(['victory', 'defeat', 'fled']).toContain(result.outcome);
      expect(result.rounds).toBeGreaterThan(0);
    }
  });

  it('a generated alpha encounter (with rolled alpha mods) also runs to completion', () => {
    const enemies = generateEncounter({
      biome: 'frostfen',
      tier: 2,
      packAvgLevel: 10,
      packSize: 2,
      kind: 'alpha',
      rng: createRng(77),
    });
    const config: CreateBattleConfig = {
      kind: 'alpha',
      playerDinos: [makeDino('frostmaw', { level: 10 }), makeDino('glacierhide', { level: 10 })],
      reserve: [],
      enemies,
      commands: [],
      skills: [],
      masterGear: {},
    };
    const result = runBattleSim(config, createRng(1));
    expect(['victory', 'defeat', 'fled']).toContain(result.outcome);
  });

  it('an apex encounter from a generated expedition runs to completion', () => {
    const exp = generateExpedition({ biome: 'verdant_maw', tier: 1, seed: 55 });
    const apex = exp.nodes.find((n) => n.kind === 'apex')!;
    const enemies = generateEncounter({
      biome: exp.biome,
      tier: exp.tier,
      packAvgLevel: 15,
      packSize: 3,
      kind: 'apex',
      rng: createRng(exp.seed).fork(`node-${apex.id}`),
    });
    const config: CreateBattleConfig = {
      kind: 'apex',
      playerDinos: [
        makeDino('bloomcrest', { level: 15 }),
        makeDino('thornback', { level: 15 }),
        makeDino('venomlash', { level: 15 }),
      ],
      reserve: [],
      enemies,
      commands: [],
      skills: [],
      masterGear: {},
    };
    const result = runBattleSim(config, createRng(2));
    expect(['victory', 'defeat', 'fled']).toContain(result.outcome);
  });

  it('walking a generated expedition end to end (layer 0 -> apex) stays internally consistent', () => {
    const exp = generateExpedition({ biome: 'cinder_peaks', tier: 1, seed: 321 });
    let guard = 0;
    while (exp.nodes.find((n) => n.id === exp.at)?.kind !== 'apex' && guard < 10) {
      const [next] = exp.at === -1 ? exp.nodes.filter((n) => n.layer === 0).map((n) => n.id) : exp.nodes.find((n) => n.id === exp.at)!.next;
      visitNode(exp, next as number);
      guard += 1;
    }
    expect(exp.nodes.find((n) => n.id === exp.at)?.kind).toBe('apex');
  });
});
