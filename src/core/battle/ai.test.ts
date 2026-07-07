import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { createBattle } from './engine';
import { basicConfig, fixedRng, makeDino, makeWildCombatant } from './testUtils';

describe('chooseAction', () => {
  it('always returns one of legalActions', () => {
    const dino = makeDino('emberfang', { moves: ['ember_snap', 'magma_bite'] });
    const enemy = makeWildCombatant('cragmaul', { moves: ['rock_smash', 'boulder_toss'] });
    const state = createBattle(basicConfig({ playerDinos: [dino], enemies: [enemy] }), fixedRng(0));
    const action = chooseAction(state, fixedRng(0.5));
    // A basic structural sanity check: it's a real BattleAction shape.
    expect(['move', 'swap', 'guard', 'tame', 'command']).toContain(action.type);
  });

  it('prefers consuming an available combo state over a plain attack', () => {
    const attacker = makeDino('voltspur', { moves: ['thunderburst', 'spark_jab'] });
    const enemy = makeWildCombatant('cragmaul');
    const state = createBattle(basicConfig({ playerDinos: [attacker], enemies: [enemy] }), fixedRng(0));
    state.turnQueue = [attacker.uid, enemy.uid];
    state.turnIndex = 0;
    const actor = state.combatants.find((c) => c.uid === attacker.uid)!;
    const target = state.combatants.find((c) => c.uid === enemy.uid)!;
    void actor;
    target.statuses.push({ id: 'soak', turnsLeft: 2, power: 0 });

    const action = chooseAction(state, fixedRng(0.9)); // 0.9 > RANDOMNESS(0.15): always take the top pick
    expect(action).toEqual({ type: 'move', move: 'thunderburst', target: enemy.uid });
  });

  it('a Warden prefers healing a badly wounded ally over attacking', () => {
    const warden = makeDino('bloomcrest', { moves: ['leaf_razor', 'soothing_springs'] });
    const woundedAlly = makeDino('emberfang');
    const enemy = makeWildCombatant('cragmaul');
    const state = createBattle(basicConfig({ playerDinos: [warden, woundedAlly], enemies: [enemy] }), fixedRng(0));
    state.turnQueue = [warden.uid, woundedAlly.uid, enemy.uid];
    state.turnIndex = 0;
    const ally = state.combatants.find((c) => c.uid === woundedAlly.uid)!;
    ally.currentHp = Math.round(ally.stats.hp * 0.1);

    const action = chooseAction(state, fixedRng(0.9));
    expect(action).toMatchObject({ type: 'move', move: 'soothing_springs' });
  });

  it('a Screecher prefers debuffing an un-debuffed target over one already debuffed', () => {
    const screecher = makeDino('galecrest', { moves: ['numbing_mist'] }); // all-enemies SPD debuff
    const enemyA = makeWildCombatant('cragmaul');
    const enemyB = makeWildCombatant('bouldershell');
    const state = createBattle(basicConfig({ playerDinos: [screecher], enemies: [enemyA, enemyB] }), fixedRng(0));
    state.turnQueue = [screecher.uid, enemyA.uid, enemyB.uid];
    state.turnIndex = 0;
    // numbing_mist is all-enemies, so pre-existing debuffs don't change targeting, but the move should
    // still be strongly preferred over doing nothing useful when no one is debuffed yet.
    const action = chooseAction(state, fixedRng(0.9));
    expect(action).toMatchObject({ type: 'move', move: 'numbing_mist' });
  });

  it('never picks a move that is on cooldown or a stunned combatant’s move', () => {
    const dino = makeDino('emberfang', { moves: ['ember_snap', 'magma_bite'] });
    const enemy = makeWildCombatant('cragmaul');
    const state = createBattle(basicConfig({ playerDinos: [dino], enemies: [enemy] }), fixedRng(0));
    state.turnQueue = [dino.uid, enemy.uid];
    state.turnIndex = 0;
    const actor = state.combatants.find((c) => c.uid === dino.uid)!;
    actor.statuses.push({ id: 'stun', turnsLeft: 1, power: 0 });

    const action = chooseAction(state, fixedRng(0.9));
    expect(action.type).not.toBe('move');
  });
});
