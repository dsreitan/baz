/**
 * Battle engine — pure reducer (ARCHITECTURE §5).
 *
 * `createBattle` builds a `BattleState` snapshot; `legalActions` enumerates
 * what the current turn-holder may do; `applyAction` mutates the state and
 * returns the `BattleEvent[]` describing what happened. Enemy turns run
 * through the exact same `applyAction` path, driven by `ai.chooseAction`.
 *
 * ---------------------------------------------------------------------
 * BattleRuntime (extra bookkeeping beyond types.ts — see Phase 3 report)
 * ---------------------------------------------------------------------
 * `types.ts` intentionally doesn't carry everything the engine needs
 * (reserve dinos, per-dino gear/trait combat modifiers, alpha-mod
 * aggregates, once-per-battle legendary flags, saved cooldowns for
 * swapped-out dinos, ...). Rather than touch the contract, this module
 * defines `BattleRuntime` and attaches it to the returned `BattleState`
 * object as a non-contractual extra property (`__runtime`), retrieved via
 * `getRuntime`. Every `BattleState` this module hands out is really an
 * `InternalBattleState`; external code only ever sees the public shape.
 *
 * ---------------------------------------------------------------------
 * Priority-move decision
 * ---------------------------------------------------------------------
 * `MoveEffect: { kind: 'priority' }` is documented as "acts first in round
 * regardless of SPD". Because `applyAction` only ever resolves an action
 * for whoever the turn queue says is currently acting (there is no
 * mechanism to act "out of turn" in this reducer), the brief explicitly
 * sanctions the simplest option: priority is applied at action time with
 * no queue reorder. Concretely, the `priority` effect is a documented
 * no-op here — the move still resolves on its user's normal turn. A future
 * phase could reorder the queue when building it if this is revisited.
 *
 * ---------------------------------------------------------------------
 * Buff/debuff -> status mapping
 * ---------------------------------------------------------------------
 * See battle/effects.ts header: generic `buff`/`debuff` MoveEffects map to
 * the three stat-modifying statuses (atk->enrage, def->harden, spd->slow)
 * with a *signed* power. Re-applying the same id overwrites (single slot
 * per status id per combatant) rather than stacking.
 */
import { ALPHA_MODS, COMMANDS, MOVES, SKILLS } from '../../data/index';
import { SPECIES, TRAITS, AFFIXES } from '../../data/index';
import { aspectMultiplier } from '../typeChart';
import {
  BASE_CRIT_CHANCE,
  CRIT_MULTIPLIER,
  DAMAGE_VARIANCE_MAX,
  DAMAGE_VARIANCE_MIN,
  GLOBAL_DAMAGE_SCALE,
  GUARD_DEFENSE_BONUS_PERCENT,
  GUARD_TURNS,
  IGNORE_DEF_FACTOR,
  STATUS_DEFAULTS,
  TAME_HP_ELIGIBLE_THRESHOLD,
} from '../balance';
import {
  applyStatus,
  cleanseNegativeStatuses,
  consumeCombo,
  effectiveStat,
  statForStatKey,
  tickEndOfRoundStatuses,
} from './effects';
import { bondEffectsForPack, computeBonds, deriveStats, stageForLevel } from '../stats';
import type { PackMember, SideBondEffects } from '../stats';
import { resolveTame, tameChance, type TameContext } from './taming';
import type {
  AlphaModId,
  BattleAction,
  BattleEvent,
  BattleState,
  Combatant,
  CommandId,
  DinoGearSlot,
  DinoInstance,
  ItemInstance,
  MasterGearSlot,
  MoveDef,
  MoveId,
  Rng,
  SkillId,
  StatKey,
  StatusId,
  Uid,
} from '../types';

// ---------------------------------------------------------------------------
// Runtime bookkeeping (see module doc)
// ---------------------------------------------------------------------------

export interface CombatMods {
  aspectDamagePercent: Partial<Record<string, number>>;
  critChancePercent: number;
  comboDamagePercent: number;
  onHitStatus: { status: StatusId; chance: number; turns: number; power: number }[];
  statusResistPercent: Partial<Record<StatusId, number>>;
  legendaryPowers: string[];
}

export interface MasterGearMods {
  tameChancePercent: number;
  commandPowerPercent: number;
  teamStatPercent: Partial<Record<StatKey, number>>;
  legendaryPowers: string[];
}

export interface AlphaAggregate {
  statBoosts: { stat: StatKey; percent: number }[];
  onHitStatus: { status: StatusId; chance: number; turns: number; power: number }[];
  statusImmune: boolean;
  thornsPercent: number;
  frenzy: boolean;
}

export interface BattleRuntime {
  /** Living (and fainted-but-not-yet-swapped-in) reserve dinos, player side only. */
  reservePlayer: DinoInstance[];
  /** Source-of-truth DinoInstance per player uid (active + reserve), kept current on swap. */
  playerDinoByUid: Record<Uid, DinoInstance>;
  /** Cooldowns preserved for a dino currently off-field, keyed by its uid. */
  savedCooldowns: Record<Uid, Record<MoveId, number>>;
  combatMods: Record<Uid, CombatMods>;
  masterGear: MasterGearMods;
  playerBondEffects: SideBondEffects;
  enemyBondEffects: SideBondEffects;
  alphaAggregates: Record<Uid, AlphaAggregate>;
  guardCooldownBonus: Set<Uid>;
  legendaryUsed: Record<Uid, Partial<Record<string, boolean>>>;
  echoingCommandUsed: boolean;
  echoingCommandPending?: { command: CommandId; target?: Uid };
  skillTameChancePercent: number;
  commandBonusPercent: Partial<Record<CommandId, number>>;
}

type InternalBattleState = BattleState & { __runtime: BattleRuntime };

function attachRuntime(state: BattleState, runtime: BattleRuntime): void {
  (state as InternalBattleState).__runtime = runtime;
}

function getRuntime(state: BattleState): BattleRuntime {
  const runtime = (state as InternalBattleState).__runtime;
  if (!runtime) {
    throw new Error('BattleState is missing its internal runtime — was it created via createBattle?');
  }
  return runtime;
}

// ---------------------------------------------------------------------------
// createBattle
// ---------------------------------------------------------------------------

export interface CreateBattleConfig {
  kind: BattleState['kind'];
  /** Active field trio (1-3 dinos). */
  playerDinos: DinoInstance[];
  reserve: DinoInstance[];
  /** Pre-built enemy combatants; `.stats` is the *base* snapshot (alpha%/bond stat boosts are applied here). */
  enemies: Combatant[];
  /** Commands unlocked for this run (from packmaster skills + DEFAULT_COMMANDS). */
  commands: CommandId[];
  skills: SkillId[];
  masterGear: Partial<Record<MasterGearSlot, ItemInstance>>;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function zeroStat(): { hp: number; atk: number; def: number; spd: number } {
  return { hp: 0, atk: 0, def: 0, spd: 0 };
}

function applyStatBoosts(
  base: { hp: number; atk: number; def: number; spd: number },
  boosts: { stat: StatKey; percent: number }[],
): { hp: number; atk: number; def: number; spd: number } {
  const sums = zeroStat();
  for (const boost of boosts) sums[boost.stat] += boost.percent;
  const result = { ...base };
  (Object.keys(result) as StatKey[]).forEach((key) => {
    result[key] = Math.max(1, Math.round(base[key] * (1 + sums[key] / 100)));
  });
  return result;
}

function packMemberFor(speciesId: string): PackMember {
  const species = SPECIES[speciesId];
  return { species: speciesId, role: species!.role, aspect: species!.aspect };
}

function computeCombatMods(dino: DinoInstance): CombatMods {
  const mods: CombatMods = {
    aspectDamagePercent: {},
    critChancePercent: 0,
    comboDamagePercent: 0,
    onHitStatus: [],
    statusResistPercent: {},
    legendaryPowers: [],
  };

  const trait = TRAITS[dino.trait];
  if (trait) {
    const effect = trait.effect;
    if (effect.kind === 'aspectDamage') {
      mods.aspectDamagePercent[effect.aspect] = (mods.aspectDamagePercent[effect.aspect] ?? 0) + effect.percent;
    } else if (effect.kind === 'critChance') {
      mods.critChancePercent += effect.percent;
    } else if (effect.kind === 'comboDamage') {
      mods.comboDamagePercent += effect.percent;
    } else if (effect.kind === 'onHitStatus') {
      mods.onHitStatus.push({ status: effect.status, chance: effect.chance, turns: effect.turns, power: effect.power });
    } else if (effect.kind === 'statusResist') {
      mods.statusResistPercent[effect.status] = (mods.statusResistPercent[effect.status] ?? 0) + effect.percent;
    }
  }

  const slots: DinoGearSlot[] = ['plating', 'talon', 'charm'];
  const items = slots.map((slot) => dino.gear[slot]).filter((item): item is ItemInstance => item != null);
  for (const item of items) {
    if (item.legendaryPower) mods.legendaryPowers.push(item.legendaryPower);
    for (const rolled of item.affixes) {
      const affix = AFFIXES[rolled.affix];
      if (!affix) continue;
      const effect = affix.effect;
      if (effect.kind === 'aspectDamage') {
        mods.aspectDamagePercent[effect.aspect] = (mods.aspectDamagePercent[effect.aspect] ?? 0) + rolled.value;
      } else if (effect.kind === 'critChance') {
        mods.critChancePercent += rolled.value;
      } else if (effect.kind === 'comboDamage') {
        mods.comboDamagePercent += rolled.value;
      } else if (effect.kind === 'onHitStatus') {
        mods.onHitStatus.push({ status: effect.status, chance: rolled.value, turns: effect.turns, power: effect.power });
      }
    }
  }

  return mods;
}

function computeMasterGearMods(masterGear: Partial<Record<MasterGearSlot, ItemInstance>>): MasterGearMods {
  const mods: MasterGearMods = {
    tameChancePercent: 0,
    commandPowerPercent: 0,
    teamStatPercent: {},
    legendaryPowers: [],
  };
  const slots: MasterGearSlot[] = ['whistle', 'satchel', 'standard'];
  for (const slot of slots) {
    const item = masterGear[slot];
    if (!item) continue;
    if (item.legendaryPower) mods.legendaryPowers.push(item.legendaryPower);
    for (const rolled of item.affixes) {
      const affix = AFFIXES[rolled.affix];
      if (!affix) continue;
      const effect = affix.effect;
      if (effect.kind === 'tameChance') {
        mods.tameChancePercent += rolled.value;
      } else if (effect.kind === 'commandPower') {
        mods.commandPowerPercent += rolled.value;
      } else if (effect.kind === 'teamStatPercent') {
        mods.teamStatPercent[effect.stat] = (mods.teamStatPercent[effect.stat] ?? 0) + rolled.value;
      }
    }
  }
  return mods;
}

function computeSkillBattleMods(skills: SkillId[]): {
  tameChancePercent: number;
  commandBonusPercent: Partial<Record<CommandId, number>>;
} {
  let tameChancePercent = 0;
  const commandBonusPercent: Partial<Record<CommandId, number>> = {};
  for (const id of skills) {
    const skill = SKILLS[id];
    if (!skill) continue;
    if (skill.effect.kind === 'tameChance') {
      tameChancePercent += skill.effect.percent;
    } else if (skill.effect.kind === 'commandBonus') {
      commandBonusPercent[skill.effect.command] = (commandBonusPercent[skill.effect.command] ?? 0) + skill.effect.percent;
    }
  }
  return { tameChancePercent, commandBonusPercent };
}

function aggregateAlphaMods(ids: AlphaModId[]): AlphaAggregate {
  const agg: AlphaAggregate = {
    statBoosts: [],
    onHitStatus: [],
    statusImmune: false,
    thornsPercent: 0,
    frenzy: false,
  };
  for (const id of ids) {
    const mod = ALPHA_MODS[id];
    if (!mod) continue;
    const effect = mod.effect;
    if (effect.kind === 'statPercent') {
      agg.statBoosts.push({ stat: effect.stat, percent: effect.percent });
    } else if (effect.kind === 'onHitStatus') {
      agg.onHitStatus.push({ status: effect.status, chance: effect.chance, turns: effect.turns, power: effect.power });
    } else if (effect.kind === 'statusImmune') {
      agg.statusImmune = true;
    } else if (effect.kind === 'thorns') {
      agg.thornsPercent += effect.percent;
    } else if (effect.kind === 'frenzy') {
      agg.frenzy = true;
    }
    // 'summonAdd' is handled at generation time (config.enemies already includes the extra ally).
  }
  return agg;
}

function buildPlayerCombatant(
  dino: DinoInstance,
  extraBoosts: { stat: StatKey; percent: number }[],
  savedCooldowns?: Record<MoveId, number>,
): Combatant {
  const baseStats = deriveStats(dino);
  const stats = applyStatBoosts(baseStats, extraBoosts);
  const maxHp = stats.hp;
  const currentHp = Math.max(1, Math.round(maxHp * dino.currentHpPercent));
  const cooldowns: Record<MoveId, number> = {};
  for (const move of dino.moves) cooldowns[move] = savedCooldowns?.[move] ?? 0;
  return {
    uid: dino.uid,
    side: 'player',
    species: dino.species,
    nickname: dino.nickname,
    level: dino.level,
    stage: stageForLevel(dino.level),
    stats,
    currentHp,
    shield: 0,
    statuses: [],
    cooldowns,
    moves: dino.moves,
    trait: dino.trait,
    alphaMods: [],
    appearanceSeed: dino.appearanceSeed,
    tameable: false,
    fainted: false,
  };
}

function teamStatBoostsFrom(runtime: BattleRuntime): { stat: StatKey; percent: number }[] {
  return (Object.entries(runtime.masterGear.teamStatPercent) as [StatKey, number][]).map(([stat, percent]) => ({
    stat,
    percent,
  }));
}

export function createBattle(config: CreateBattleConfig, rng: Rng): BattleState {
  const playerDinoByUid: Record<Uid, DinoInstance> = {};
  for (const dino of [...config.playerDinos, ...config.reserve]) playerDinoByUid[dino.uid] = dino;

  const skillMods = computeSkillBattleMods(config.skills);
  const masterGearMods = computeMasterGearMods(config.masterGear);

  const playerPack: PackMember[] = config.playerDinos.map((d) => packMemberFor(d.species));
  const enemyPack: PackMember[] = config.enemies.map((c) => packMemberFor(c.species));

  const playerBonds = computeBonds(playerPack);
  const enemyBonds = computeBonds(enemyPack);
  const playerBondEffects = bondEffectsForPack(playerPack);
  const enemyBondEffects = bondEffectsForPack(enemyPack);

  const combatMods: Record<Uid, CombatMods> = {};
  for (const dino of [...config.playerDinos, ...config.reserve]) combatMods[dino.uid] = computeCombatMods(dino);

  const masterGearTeamBoosts = (Object.entries(masterGearMods.teamStatPercent) as [StatKey, number][]).map(
    ([stat, percent]) => ({ stat, percent }),
  );

  const playerCombatants = config.playerDinos.map((dino) =>
    buildPlayerCombatant(dino, [...playerBondEffects.statBoosts, ...masterGearTeamBoosts]),
  );

  const alphaAggregates: Record<Uid, AlphaAggregate> = {};
  const enemyCombatants: Combatant[] = config.enemies.map((raw) => {
    const alphaAgg = aggregateAlphaMods(raw.alphaMods);
    alphaAggregates[raw.uid] = alphaAgg;
    const stats = applyStatBoosts(raw.stats, [...alphaAgg.statBoosts, ...enemyBondEffects.statBoosts]);
    const cooldowns: Record<MoveId, number> = {};
    for (const move of raw.moves) cooldowns[move] = 0;
    return {
      ...raw,
      stats,
      currentHp: stats.hp,
      shield: 0,
      statuses: [],
      cooldowns,
      fainted: false,
    };
  });

  const state: BattleState = {
    kind: config.kind,
    round: 1,
    combatants: [...playerCombatants, ...enemyCombatants],
    turnQueue: [],
    turnIndex: 0,
    playerBonds,
    enemyBonds,
    commandUsedThisRound: false,
    lureActive: false,
    commands: config.commands,
  };

  const runtime: BattleRuntime = {
    reservePlayer: [...config.reserve],
    playerDinoByUid,
    savedCooldowns: {},
    combatMods,
    masterGear: masterGearMods,
    playerBondEffects,
    enemyBondEffects,
    alphaAggregates,
    guardCooldownBonus: new Set(),
    legendaryUsed: {},
    echoingCommandUsed: false,
    skillTameChancePercent: skillMods.tameChancePercent,
    commandBonusPercent: skillMods.commandBonusPercent,
  };
  attachRuntime(state, runtime);

  state.turnQueue = buildTurnQueue(state, runtime, rng);
  return state;
}

// ---------------------------------------------------------------------------
// Effective stats (status + frenzy aware)
// ---------------------------------------------------------------------------

function getEffectiveStat(runtime: BattleRuntime, combatant: Combatant, stat: StatKey): number {
  let value = effectiveStat(combatant, stat);
  const alpha = runtime.alphaAggregates[combatant.uid];
  if (alpha?.frenzy && (stat === 'atk' || stat === 'spd')) {
    const hpFraction = combatant.stats.hp > 0 ? combatant.currentHp / combatant.stats.hp : 0;
    if (hpFraction < STATUS_DEFAULTS.frenzyHpThreshold) {
      value = Math.round(value * (1 + STATUS_DEFAULTS.frenzyStatBonusPercent / 100));
    }
  }
  return Math.max(1, value);
}

/**
 * Living combatants ordered by effective SPD descending. Ties are broken by
 * shuffling first (via `rng`) so equal-SPD combatants don't always resolve
 * in the same array order — the one piece of "creation-time" randomness
 * `createBattle`'s `rng` parameter is used for.
 */
function buildTurnQueue(state: BattleState, runtime: BattleRuntime, rng: Rng): Uid[] {
  const living = rng.shuffle(state.combatants.filter((c) => !c.fainted));
  const sorted = [...living].sort((a, b) => getEffectiveStat(runtime, b, 'spd') - getEffectiveStat(runtime, a, 'spd'));
  return sorted.map((c) => c.uid);
}

// ---------------------------------------------------------------------------
// legalActions
// ---------------------------------------------------------------------------

function livingOn(state: BattleState, side: Combatant['side']): Combatant[] {
  return state.combatants.filter((c) => c.side === side && !c.fainted);
}

function legalMoveTargets(state: BattleState, actor: Combatant, moveDef: MoveDef): Uid[] {
  const enemySide = actor.side === 'player' ? 'enemy' : 'player';
  switch (moveDef.targets) {
    case 'self':
      return [actor.uid];
    case 'enemy':
      return livingOn(state, enemySide).map((c) => c.uid);
    case 'ally':
      return livingOn(state, actor.side).map((c) => c.uid);
    case 'all-enemies': {
      const first = livingOn(state, enemySide)[0];
      return first ? [first.uid] : [];
    }
    case 'all-allies': {
      const first = livingOn(state, actor.side)[0];
      return first ? [first.uid] : [];
    }
  }
}

function legalCommandActions(state: BattleState, runtime: BattleRuntime, command: CommandId): BattleAction[] {
  const def = COMMANDS[command];
  if (!def) return [];
  switch (def.effect.kind) {
    case 'teamBuff':
    case 'lure':
    case 'cleanseTeam':
      return [{ type: 'command', command }];
    case 'healTarget':
    case 'resetCooldowns':
      return livingOn(state, 'player').map((c) => ({ type: 'command', command, target: c.uid }));
    case 'freeSwap':
      return runtime.reservePlayer
        .filter((d) => d.currentHpPercent > 0)
        .map((d) => ({ type: 'command', command, target: d.uid }));
  }
}

/** Wild/alpha battles only (apex bosses are never tameable — see SpeciesDef.isBoss). */
function findLowestHpTameableEnemy(state: BattleState): Combatant | undefined {
  const candidates = livingOn(state, 'enemy').filter(
    (c) => c.tameable && c.stats.hp > 0 && c.currentHp / c.stats.hp < TAME_HP_ELIGIBLE_THRESHOLD,
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((a, b) => (a.currentHp / a.stats.hp <= b.currentHp / b.stats.hp ? a : b));
}

export function legalActions(state: BattleState): BattleAction[] {
  const runtime = getRuntime(state);
  const uid = state.turnQueue[state.turnIndex];
  if (uid === undefined) return [];
  const actor = state.combatants.find((c) => c.uid === uid);
  if (!actor || actor.fainted) return [];

  const actions: BattleAction[] = [];
  const stunned = actor.statuses.some((s) => s.id === 'stun');

  if (!stunned) {
    for (const moveId of actor.moves) {
      if ((actor.cooldowns[moveId] ?? 0) > 0) continue;
      const moveDef = MOVES[moveId];
      if (!moveDef) continue;
      for (const target of legalMoveTargets(state, actor, moveDef)) {
        actions.push({ type: 'move', move: moveId, target });
      }
    }
  }

  actions.push({ type: 'guard' });

  if (actor.side === 'player') {
    for (const dino of runtime.reservePlayer) {
      if (dino.currentHpPercent > 0) actions.push({ type: 'swap', withDino: dino.uid });
    }
    if (state.kind !== 'apex' && findLowestHpTameableEnemy(state)) {
      actions.push({ type: 'tame' });
    }
    if (!state.commandUsedThisRound) {
      for (const command of state.commands) {
        actions.push(...legalCommandActions(state, runtime, command));
      }
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// applyAction
// ---------------------------------------------------------------------------

export function isBattleOver(state: BattleState): boolean {
  return state.outcome !== undefined;
}

/**
 * Public tame-chance helper (additive Phase 6 export — closes the Phase 5
 * report's friction note). Computes the *real* chance a `{type:'tame'}`
 * action would roll right now against the current lowest-HP tameable enemy,
 * including Handler skill and satchel-affix bonuses that otherwise only
 * live in the private `BattleRuntime`. Returns 0 if there is no eligible
 * tame target this instant (see `findLowestHpTameableEnemy`).
 */
export function computeTameChance(state: BattleState): number {
  const runtime = getRuntime(state);
  const target = findLowestHpTameableEnemy(state);
  if (!target) return 0;
  const ctx: TameContext = {
    lureActive: state.lureActive,
    skillTameChancePercent: runtime.skillTameChancePercent,
    affixTameChancePercent: runtime.masterGear.tameChancePercent,
  };
  return tameChance(target, ctx);
}

function requireCombatant(state: BattleState, uid: Uid): Combatant {
  const c = state.combatants.find((x) => x.uid === uid);
  if (!c) throw new Error(`applyAction: no combatant with uid "${uid}"`);
  return c;
}

function checkFaint(target: Combatant, events: BattleEvent[]): void {
  if (!target.fainted && target.currentHp <= 0) {
    target.fainted = true;
    events.push({ e: 'faint', uid: target.uid });
  }
}

function applyDamageToCombatant(
  target: Combatant,
  amount: number,
  crit: boolean,
  effective: 'strong' | 'weak' | 'neutral',
  events: BattleEvent[],
): void {
  let remaining = amount;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) target.currentHp = Math.max(0, target.currentHp - remaining);
  events.push({ e: 'damage', uid: target.uid, amount, crit, effective });
}

function applyHealToCombatant(target: Combatant, amount: number, events: BattleEvent[]): void {
  if (target.fainted) return;
  const maxHp = target.stats.hp;
  const before = target.currentHp;
  target.currentHp = Math.min(maxHp, target.currentHp + amount);
  const healed = target.currentHp - before;
  if (healed > 0) events.push({ e: 'heal', uid: target.uid, amount: healed });
}

interface ComboBonus {
  bonusDamage?: number;
  guaranteedCrit?: boolean;
  ignoreDef?: boolean;
}

function computeDamage(
  state: BattleState,
  runtime: BattleRuntime,
  attacker: Combatant,
  target: Combatant,
  moveDef: MoveDef,
  power: number,
  combo: ComboBonus,
  rng: Rng,
): { amount: number; crit: boolean; effective: 'strong' | 'weak' | 'neutral' } {
  const atk = getEffectiveStat(runtime, attacker, 'atk');
  let def = getEffectiveStat(runtime, target, 'def');
  if (combo.ignoreDef) def = Math.max(1, def * IGNORE_DEF_FACTOR);

  const targetSpecies = SPECIES[target.species];
  const aspectMult = targetSpecies ? aspectMultiplier(moveDef.aspect, targetSpecies.aspect) : 1;
  const effective: 'strong' | 'weak' | 'neutral' = aspectMult > 1 ? 'strong' : aspectMult < 1 ? 'weak' : 'neutral';

  const sideBonds = attacker.side === 'player' ? runtime.playerBondEffects : runtime.enemyBondEffects;
  const bondAspectPercent = sideBonds.aspectDamagePercent[moveDef.aspect] ?? 0;
  const defenderBonds = target.side === 'player' ? runtime.playerBondEffects : runtime.enemyBondEffects;
  const damageTakenPercent = defenderBonds.damageTakenPercent; // Guardian bond: negative = reduction

  const mods = runtime.combatMods[attacker.uid];
  const traitAffixAspectPercent = mods?.aspectDamagePercent[moveDef.aspect] ?? 0;

  let comboMult = 1;
  if (combo.bonusDamage) {
    const comboDamagePercentBonus = mods?.comboDamagePercent ?? 0;
    comboMult += combo.bonusDamage * (1 + comboDamagePercentBonus / 100);
  }

  let legendaryMult = 1;
  if (mods?.legendaryPowers.includes('apex_hunger')) {
    const targetIsAlphaOrApex = target.alphaMods.length > 0 || state.kind !== 'wild';
    if (targetIsAlphaOrApex) legendaryMult *= 1 + STATUS_DEFAULTS.apexHungerDamagePercent / 100;
  }

  const variance = DAMAGE_VARIANCE_MIN + rng.next() * (DAMAGE_VARIANCE_MAX - DAMAGE_VARIANCE_MIN);

  const critChancePercent = BASE_CRIT_CHANCE * 100 + (mods?.critChancePercent ?? 0) + sideBonds.critChancePercent;
  const crit = combo.guaranteedCrit === true || rng.chance(clamp01(critChancePercent / 100));

  let amount =
    power *
    (atk / def) *
    aspectMult *
    (1 + bondAspectPercent / 100) *
    comboMult *
    (1 + traitAffixAspectPercent / 100) *
    legendaryMult *
    (1 + damageTakenPercent / 100) *
    variance *
    GLOBAL_DAMAGE_SCALE;
  if (crit) amount *= CRIT_MULTIPLIER;

  return { amount: Math.max(1, Math.round(amount)), crit, effective };
}

function applyThorns(runtime: BattleRuntime, target: Combatant, attacker: Combatant, amount: number, events: BattleEvent[]): void {
  if (attacker.fainted) return;
  const pct = runtime.alphaAggregates[target.uid]?.thornsPercent ?? 0;
  if (pct <= 0) return;
  const reflect = Math.max(1, Math.round(amount * (pct / 100)));
  applyDamageToCombatant(attacker, reflect, false, 'neutral', events);
  checkFaint(attacker, events);
}

function maybeTriggerLifewarden(runtime: BattleRuntime, combatant: Combatant, events: BattleEvent[], rng: Rng): void {
  if (combatant.fainted) return;
  const mods = runtime.combatMods[combatant.uid];
  if (!mods?.legendaryPowers.includes('lifewarden_bloom')) return;
  if (runtime.legendaryUsed[combatant.uid]?.['lifewarden_bloom']) return;
  const hpFraction = combatant.stats.hp > 0 ? combatant.currentHp / combatant.stats.hp : 0;
  if (hpFraction >= STATUS_DEFAULTS.lifewardenHpThreshold) return;
  runtime.legendaryUsed[combatant.uid] = { ...(runtime.legendaryUsed[combatant.uid] ?? {}), lifewarden_bloom: true };
  const result = applyStatus(combatant, 'regen', STATUS_DEFAULTS.lifewardenRegenTurns, STATUS_DEFAULTS.lifewardenRegenPercent / 100, {
    chance: 1,
    rng,
  });
  if (result.applied) {
    events.push({ e: 'statusApplied', uid: combatant.uid, status: 'regen', turns: STATUS_DEFAULTS.lifewardenRegenTurns });
  }
}

function applyOnHitEffects(runtime: BattleRuntime, attacker: Combatant, target: Combatant, events: BattleEvent[], rng: Rng): void {
  if (target.fainted) return;
  const immune = !!runtime.alphaAggregates[target.uid]?.statusImmune;
  const resistFor = (id: StatusId): number => runtime.combatMods[target.uid]?.statusResistPercent[id] ?? 0;

  const sources = [
    ...(runtime.combatMods[attacker.uid]?.onHitStatus ?? []),
    ...(runtime.alphaAggregates[attacker.uid]?.onHitStatus ?? []),
  ];
  for (const source of sources) {
    const result = applyStatus(target, source.status, source.turns, source.power, {
      chance: source.chance,
      resistPercent: resistFor(source.status),
      immune,
      rng,
    });
    if (result.applied) events.push({ e: 'statusApplied', uid: target.uid, status: source.status, turns: source.turns });
  }

  if (runtime.combatMods[attacker.uid]?.legendaryPowers.includes('stormheart_core')) {
    const result = applyStatus(target, 'charged', STATUS_DEFAULTS.stormheartTurns, 0, {
      chance: STATUS_DEFAULTS.stormheartChance,
      resistPercent: resistFor('charged'),
      immune,
      rng,
    });
    if (result.applied) {
      events.push({ e: 'statusApplied', uid: target.uid, status: 'charged', turns: STATUS_DEFAULTS.stormheartTurns });
    }
  }
}

function resolveTargets(state: BattleState, actor: Combatant, action: Extract<BattleAction, { type: 'move' }>, moveDef: MoveDef): Combatant[] {
  const enemySide = actor.side === 'player' ? 'enemy' : 'player';
  switch (moveDef.targets) {
    case 'self':
      return [actor];
    case 'enemy':
    case 'ally': {
      const t = state.combatants.find((c) => c.uid === action.target && !c.fainted);
      return t ? [t] : [];
    }
    case 'all-enemies':
      return livingOn(state, enemySide);
    case 'all-allies':
      return livingOn(state, actor.side);
  }
}

function applyMoveEffect(
  state: BattleState,
  runtime: BattleRuntime,
  attacker: Combatant,
  target: Combatant,
  moveDef: MoveDef,
  effect: MoveDef['effects'][number],
  combo: ComboBonus,
  rng: Rng,
  events: BattleEvent[],
): void {
  switch (effect.kind) {
    case 'damage': {
      const dmg = computeDamage(state, runtime, attacker, target, moveDef, effect.power, combo, rng);
      applyDamageToCombatant(target, dmg.amount, dmg.crit, dmg.effective, events);
      checkFaint(target, events);
      applyThorns(runtime, target, attacker, dmg.amount, events);
      maybeTriggerLifewarden(runtime, target, events, rng);
      if (!target.fainted) applyOnHitEffects(runtime, attacker, target, events, rng);
      break;
    }
    case 'applyStatus': {
      const bond = attacker.side === 'player' ? runtime.playerBondEffects : runtime.enemyBondEffects;
      const chance = clamp01(effect.chance + bond.statusChanceBonus);
      const resist = runtime.combatMods[target.uid]?.statusResistPercent[effect.status] ?? 0;
      const immune = !!runtime.alphaAggregates[target.uid]?.statusImmune;
      const result = applyStatus(target, effect.status, effect.turns, effect.power, { chance, resistPercent: resist, immune, rng });
      if (result.applied) events.push({ e: 'statusApplied', uid: target.uid, status: effect.status, turns: effect.turns });
      break;
    }
    case 'heal': {
      const bond = attacker.side === 'player' ? runtime.playerBondEffects : runtime.enemyBondEffects;
      const amount = Math.max(1, Math.round(target.stats.hp * effect.percentMaxHp * (1 + bond.healPercent / 100)));
      applyHealToCombatant(target, amount, events);
      break;
    }
    case 'buff':
    case 'debuff': {
      const statusId = statForStatKey(effect.stat);
      if (!statusId) break;
      const isDebuff = effect.kind === 'debuff';
      const bond = attacker.side === 'player' ? runtime.playerBondEffects : runtime.enemyBondEffects;
      const magnitude = isDebuff ? effect.percent * (1 + bond.debuffMagnitudePercent / 100) : effect.percent;
      const power = (isDebuff ? -1 : 1) * (magnitude / 100);
      const resist = runtime.combatMods[target.uid]?.statusResistPercent[statusId] ?? 0;
      const immune = !!runtime.alphaAggregates[target.uid]?.statusImmune;
      const chance = isDebuff ? clamp01(1 - resist / 100 + bond.statusChanceBonus) : 1;
      const result = applyStatus(target, statusId, effect.turns, power, { chance, immune, rng });
      if (result.applied) {
        events.push({ e: 'buff', uid: target.uid, stat: effect.stat, percent: isDebuff ? -magnitude : magnitude });
      }
      break;
    }
    case 'cleanse': {
      const removed = cleanseNegativeStatuses(target);
      for (const id of removed) events.push({ e: 'statusExpired', uid: target.uid, status: id });
      break;
    }
    case 'shield': {
      const amount = Math.max(1, Math.round(target.stats.hp * effect.percentMaxHp));
      target.shield += amount;
      events.push({ e: 'shield', uid: target.uid, amount });
      break;
    }
    case 'priority':
      break; // documented no-op — see module header.
  }
}

function applyMove(state: BattleState, runtime: BattleRuntime, action: Extract<BattleAction, { type: 'move' }>, rng: Rng, events: BattleEvent[]): void {
  const actingUid = state.turnQueue[state.turnIndex] as Uid;
  const actor = requireCombatant(state, actingUid);
  events.push({ e: 'turnStart', uid: actor.uid });

  const moveDef = MOVES[action.move];
  if (!moveDef || !actor.moves.includes(action.move) || (actor.cooldowns[action.move] ?? 0) > 0) {
    advanceTurn(state, runtime, events, rng);
    return;
  }

  const targets = resolveTargets(state, actor, action, moveDef);
  events.push({ e: 'moveUsed', uid: actor.uid, move: action.move, targets: targets.map((t) => t.uid) });
  actor.cooldowns[action.move] = moveDef.cooldown;

  for (const target of targets) {
    if (target.fainted) continue;
    const hit = rng.chance(moveDef.accuracy);
    if (!hit) {
      events.push({ e: 'miss', uid: target.uid, move: action.move });
      continue;
    }

    let combo: ComboBonus = {};
    if (moveDef.combo) {
      const consumed = consumeCombo(target, moveDef.combo.consumes);
      if (consumed) {
        combo = {
          bonusDamage: moveDef.combo.bonusDamage,
          guaranteedCrit: moveDef.combo.guaranteedCrit,
          ignoreDef: moveDef.combo.ignoreDef,
        };
        const bonus = moveDef.combo.bonusDamage
          ? `bonusDamage:${moveDef.combo.bonusDamage}`
          : moveDef.combo.guaranteedCrit
            ? 'guaranteedCrit'
            : 'ignoreDef';
        events.push({ e: 'comboConsumed', uid: actor.uid, status: consumed.id, bonus });

        if (runtime.combatMods[actor.uid]?.legendaryPowers.includes('everburning_sinew')) {
          for (const m of Object.keys(actor.cooldowns)) {
            if ((actor.cooldowns[m] ?? 0) > 0) actor.cooldowns[m] = Math.max(0, (actor.cooldowns[m] ?? 0) - 1);
          }
        }
      }
    }

    for (const effect of moveDef.effects) {
      applyMoveEffect(state, runtime, actor, target, moveDef, effect, combo, rng, events);
    }
  }

  checkBattleEnd(state, runtime, events);
  if (!state.outcome) advanceTurn(state, runtime, events, rng);
}

function performSwap(state: BattleState, runtime: BattleRuntime, outgoingUid: Uid, incomingDinoUid: Uid, events: BattleEvent[]): boolean {
  const outgoing = state.combatants.find((c) => c.uid === outgoingUid);
  const incoming = runtime.reservePlayer.find((d) => d.uid === incomingDinoUid);
  if (!outgoing || outgoing.fainted || !incoming) return false;

  runtime.savedCooldowns[outgoing.uid] = { ...outgoing.cooldowns };
  const outgoingDino = runtime.playerDinoByUid[outgoing.uid];
  const updatedOutgoingDino: DinoInstance = outgoingDino
    ? { ...outgoingDino, currentHpPercent: outgoing.stats.hp > 0 ? outgoing.currentHp / outgoing.stats.hp : 0 }
    : incoming;
  runtime.playerDinoByUid[outgoing.uid] = updatedOutgoingDino;
  runtime.reservePlayer = runtime.reservePlayer.filter((d) => d.uid !== incoming.uid).concat([updatedOutgoingDino]);

  const boosts = [...runtime.playerBondEffects.statBoosts, ...teamStatBoostsFrom(runtime)];
  const newCombatant = buildPlayerCombatant(incoming, boosts, runtime.savedCooldowns[incoming.uid]);
  const idx = state.combatants.findIndex((c) => c.uid === outgoing.uid);
  state.combatants[idx] = newCombatant;
  events.push({ e: 'swap', outUid: outgoing.uid, inUid: newCombatant.uid });
  return true;
}

function applySwap(state: BattleState, runtime: BattleRuntime, action: Extract<BattleAction, { type: 'swap' }>, rng: Rng, events: BattleEvent[]): void {
  const actingUid = state.turnQueue[state.turnIndex] as Uid;
  const actor = requireCombatant(state, actingUid);
  events.push({ e: 'turnStart', uid: actor.uid });
  performSwap(state, runtime, actor.uid, action.withDino, events);
  checkBattleEnd(state, runtime, events);
  if (!state.outcome) advanceTurn(state, runtime, events, rng);
}

function applyGuard(state: BattleState, runtime: BattleRuntime, rng: Rng, events: BattleEvent[]): void {
  const actingUid = state.turnQueue[state.turnIndex] as Uid;
  const actor = requireCombatant(state, actingUid);
  events.push({ e: 'turnStart', uid: actor.uid });
  applyStatus(actor, 'harden', GUARD_TURNS, GUARD_DEFENSE_BONUS_PERCENT / 100, { chance: 1, rng });
  runtime.guardCooldownBonus.add(actor.uid);
  events.push({ e: 'guard', uid: actor.uid });
  advanceTurn(state, runtime, events, rng);
}

function applyTame(state: BattleState, runtime: BattleRuntime, rng: Rng, events: BattleEvent[]): void {
  const actingUid = state.turnQueue[state.turnIndex] as Uid;
  const actor = requireCombatant(state, actingUid);
  events.push({ e: 'turnStart', uid: actor.uid });

  const target = findLowestHpTameableEnemy(state);
  if (!target) {
    advanceTurn(state, runtime, events, rng);
    return;
  }

  const ctx: TameContext = {
    lureActive: state.lureActive,
    skillTameChancePercent: runtime.skillTameChancePercent,
    affixTameChancePercent: runtime.masterGear.tameChancePercent,
  };
  const lureOfWilds = runtime.masterGear.legendaryPowers.includes('lure_of_the_wilds');
  const result = resolveTame(target, ctx, rng, lureOfWilds);
  events.push({ e: 'tameAttempt', uid: target.uid, chance: result.chance, success: result.success });
  if (result.success) {
    target.fainted = true; // captured, removed from the field (not a "faint" event: it isn't defeated)
    state.tamed = target.uid;
  } else if (result.enraged) {
    events.push({ e: 'statusApplied', uid: target.uid, status: 'enrage', turns: STATUS_DEFAULTS.tameFailEnrageTurns });
  }
  state.lureActive = false;

  checkBattleEnd(state, runtime, events);
  if (!state.outcome) advanceTurn(state, runtime, events, rng);
}

function resolveCommandEffect(
  state: BattleState,
  runtime: BattleRuntime,
  command: CommandId,
  target: Uid | undefined,
  events: BattleEvent[],
  rng: Rng,
): void {
  const def = COMMANDS[command];
  if (!def) return;
  const mult = (1 + (runtime.commandBonusPercent[command] ?? 0) / 100) * (1 + runtime.masterGear.commandPowerPercent / 100);

  switch (def.effect.kind) {
    case 'teamBuff': {
      const statusId = statForStatKey(def.effect.stat);
      if (statusId) {
        for (const c of livingOn(state, 'player')) {
          applyStatus(c, statusId, 1, (def.effect.percent * mult) / 100, { chance: 1, rng });
        }
      }
      events.push({ e: 'command', command });
      break;
    }
    case 'healTarget': {
      const c = target ? state.combatants.find((x) => x.uid === target) : undefined;
      if (c) applyHealToCombatant(c, Math.max(1, Math.round(c.stats.hp * def.effect.percentMaxHp * mult)), events);
      events.push({ e: 'command', command, target });
      break;
    }
    case 'lure': {
      state.lureActive = true;
      events.push({ e: 'command', command });
      break;
    }
    case 'freeSwap': {
      const outgoingUid = state.turnQueue[state.turnIndex];
      if (target !== undefined && outgoingUid !== undefined) performSwap(state, runtime, outgoingUid, target, events);
      events.push({ e: 'command', command, target });
      break;
    }
    case 'resetCooldowns': {
      const c = target ? state.combatants.find((x) => x.uid === target) : undefined;
      if (c) {
        for (const move of Object.keys(c.cooldowns)) c.cooldowns[move] = 0;
      }
      events.push({ e: 'command', command, target });
      break;
    }
    case 'cleanseTeam': {
      for (const c of livingOn(state, 'player')) {
        for (const id of cleanseNegativeStatuses(c)) events.push({ e: 'statusExpired', uid: c.uid, status: id });
      }
      events.push({ e: 'command', command });
      break;
    }
  }
}

function applyCommand(state: BattleState, runtime: BattleRuntime, action: Extract<BattleAction, { type: 'command' }>, rng: Rng, events: BattleEvent[]): void {
  resolveCommandEffect(state, runtime, action.command, action.target, events, rng);
  state.commandUsedThisRound = true;

  if (runtime.masterGear.legendaryPowers.includes('echoing_command') && !runtime.echoingCommandUsed) {
    runtime.echoingCommandUsed = true;
    runtime.echoingCommandPending = { command: action.command, target: action.target };
  }
  checkBattleEnd(state, runtime, events);
}

// ---------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------

function isFaintedOrGone(state: BattleState, uid: Uid): boolean {
  const c = state.combatants.find((x) => x.uid === uid);
  return !c || c.fainted;
}

function checkBattleEnd(state: BattleState, runtime: BattleRuntime, events: BattleEvent[]): void {
  if (state.outcome) return;
  const enemyAlive = livingOn(state, 'enemy').length > 0;
  if (!enemyAlive) {
    state.outcome = 'victory';
    events.push({ e: 'battleEnd', outcome: 'victory' });
    return;
  }
  const playerFieldAlive = livingOn(state, 'player').length > 0;
  const playerReserveAlive = runtime.reservePlayer.some((d) => d.currentHpPercent > 0);
  if (!playerFieldAlive && !playerReserveAlive) {
    state.outcome = 'defeat';
    events.push({ e: 'battleEnd', outcome: 'defeat' });
  }
}

function endOfRound(state: BattleState, runtime: BattleRuntime, events: BattleEvent[], rng: Rng): void {
  for (const c of state.combatants) {
    if (c.fainted) continue;
    events.push(...tickEndOfRoundStatuses(c));
    checkFaint(c, events);
    maybeTriggerLifewarden(runtime, c, events, rng);
  }
  checkBattleEnd(state, runtime, events);
  if (state.outcome) return;

  for (const c of state.combatants) {
    if (c.fainted) continue;
    const extra = runtime.guardCooldownBonus.has(c.uid) ? 1 : 0;
    for (const move of Object.keys(c.cooldowns)) {
      const current = c.cooldowns[move] ?? 0;
      if (current > 0) c.cooldowns[move] = Math.max(0, current - 1 - extra);
    }
  }
  runtime.guardCooldownBonus.clear();
  state.commandUsedThisRound = false;

  if (runtime.echoingCommandPending) {
    const pending = runtime.echoingCommandPending;
    runtime.echoingCommandPending = undefined;
    resolveCommandEffect(state, runtime, pending.command, pending.target, events, rng);
  }

  state.round += 1;
  state.turnQueue = buildTurnQueue(state, runtime, rng);
  state.turnIndex = 0;
  events.push({ e: 'roundStart', round: state.round });
  checkBattleEnd(state, runtime, events);
}

function advanceTurn(state: BattleState, runtime: BattleRuntime, events: BattleEvent[], rng: Rng): void {
  state.turnIndex += 1;
  while (state.turnIndex < state.turnQueue.length && isFaintedOrGone(state, state.turnQueue[state.turnIndex] as Uid)) {
    state.turnIndex += 1;
  }
  if (state.turnIndex >= state.turnQueue.length) {
    endOfRound(state, runtime, events, rng);
  }
}

// ---------------------------------------------------------------------------
// applyAction entry point
// ---------------------------------------------------------------------------

export function applyAction(state: BattleState, action: BattleAction, rng: Rng): BattleEvent[] {
  const runtime = getRuntime(state);
  const events: BattleEvent[] = [];
  if (state.outcome) return events;

  switch (action.type) {
    case 'move':
      applyMove(state, runtime, action, rng, events);
      break;
    case 'swap':
      applySwap(state, runtime, action, rng, events);
      break;
    case 'guard':
      applyGuard(state, runtime, rng, events);
      break;
    case 'tame':
      applyTame(state, runtime, rng, events);
      break;
    case 'command':
      applyCommand(state, runtime, action, rng, events);
      break;
  }

  return events;
}
