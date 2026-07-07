/**
 * Headless battle simulator (ARCHITECTURE §5/§8): drives both sides with
 * `ai.chooseAction` through the real reducer, for tests and balance work.
 */
import { createRng } from './rng';
import { chooseAction } from './battle/ai';
import { applyAction, createBattle, isBattleOver, type CreateBattleConfig } from './battle/engine';
import type { BattleEvent, BattleState, Combatant, CommandId, DinoInstance, ItemInstance, MasterGearSlot, Rng, SkillId } from './types';

export interface SimResult {
  outcome: 'victory' | 'defeat' | 'fled';
  rounds: number;
  events: BattleEvent[];
}

/** Safety valve against a runaway loop from an engine bug (e.g. a round that never advances). */
const MAX_ACTIONS = 5000;

/** Run one battle to completion, both sides driven by `ai.ts`. */
export function runBattleSim(config: CreateBattleConfig, rng: Rng, maxRounds = 100): SimResult {
  const state: BattleState = createBattle(config, rng);
  const events: BattleEvent[] = [];
  let actions = 0;
  while (!isBattleOver(state) && actions < MAX_ACTIONS && state.round <= maxRounds) {
    const action = chooseAction(state, rng);
    events.push(...applyAction(state, action, rng));
    actions += 1;
  }
  return { outcome: state.outcome ?? 'fled', rounds: state.round, events };
}

export interface MatchupOptions {
  reserve?: DinoInstance[];
  kind?: BattleState['kind'];
  commands?: CommandId[];
  skills?: SkillId[];
  masterGear?: Partial<Record<MasterGearSlot, ItemInstance>>;
  maxRounds?: number;
}

export interface MatchupResult {
  wins: number;
  losses: number;
  winRate: number;
  averageRounds: number;
}

/** Run `n` independent auto-battles (fresh RNG fork per run, deterministic from `seed`) and report the win rate. */
export function runMatchup(
  playerDinos: DinoInstance[],
  enemies: Combatant[],
  n: number,
  seed: number,
  options: MatchupOptions = {},
): MatchupResult {
  const rootRng = createRng(seed);
  let wins = 0;
  let losses = 0;
  let totalRounds = 0;

  for (let i = 0; i < n; i++) {
    const runRng = rootRng.fork(`match-${i}`);
    const config: CreateBattleConfig = {
      kind: options.kind ?? 'wild',
      playerDinos,
      reserve: options.reserve ?? [],
      enemies,
      commands: options.commands ?? [],
      skills: options.skills ?? [],
      masterGear: options.masterGear ?? {},
    };
    const result = runBattleSim(config, runRng, options.maxRounds ?? 100);
    if (result.outcome === 'victory') wins += 1;
    else losses += 1;
    totalRounds += result.rounds;
  }

  return { wins, losses, winRate: wins / n, averageRounds: totalRounds / n };
}
