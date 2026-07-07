/**
 * Battle screen — the 3v3 turn-based combat UI (ARCHITECTURE §4/§5,
 * DESIGN §8). Driven ONLY by the engine's public API: `legalActions`,
 * `applyAction`, `isBattleOver` (src/core/battle/engine.ts), `chooseAction`
 * (ai.ts) for enemy turns, and `tameChance` (taming.ts) for the tame %
 * hint. This module owns no game rules — it renders `BattleState` and
 * replays the `BattleEvent[]` each `applyAction` call returns.
 *
 * ---------------------------------------------------------------------
 * UX flow (stated once, per the Phase 5 brief): MOVE FIRST, THEN TARGET.
 * ---------------------------------------------------------------------
 * Clicking a move button immediately resolves it if it has exactly one
 * legal target (self / all-enemies / all-allies / a single living foe);
 * otherwise the screen enters "targeting mode" — eligible sprites get a
 * `.dino-card-targetable` outline and the next sprite click resolves the
 * action. The same targeting-mode machinery is reused for commands that
 * need a target (Field Dressing, Focus) and for Swap / Recall, which open
 * a small reserve-picker modal instead (reserve dinos aren't on the field
 * to click).
 *
 * ---------------------------------------------------------------------
 * Commands don't consume the turn (ARCHITECTURE §5): `applyAction` for a
 * `command` never advances `turnIndex` internally, so after animating a
 * command's events this screen re-shows the action panel for the SAME
 * actor (now with the command bar disabled) instead of advancing to the
 * next turn-holder. Every other action type does advance the turn.
 *
 * ---------------------------------------------------------------------
 * Engine-API friction (see Phase 5 report): the effective tame-chance
 * formula's skill/gear bonuses live inside the engine's private
 * `BattleRuntime` (attached to `BattleState` as a non-contractual
 * `__runtime`, per engine.ts's own module doc) and aren't exposed on the
 * public `BattleState`/`BattleAction` surface. The tame button below calls
 * the public `tameChance()` with zeroed skill/affix bonuses, so the
 * displayed % is a floor (lureActive is public via `BattleState.lureActive`
 * and IS reflected) rather than the exact number `applyTame` will roll.
 */
import { createRng } from '../../core/rng';
import { applyAction, isBattleOver, legalActions } from '../../core/battle/engine';
import { chooseAction } from '../../core/battle/ai';
import { tameChance, type TameContext } from '../../core/battle/taming';
import { TAME_HP_ELIGIBLE_THRESHOLD } from '../../core/balance';
import { aspectMultiplier } from '../../core/typeChart';
import { stageForLevel } from '../../core/stats';
import { COMMANDS, MOVES, SPECIES } from '../../data/index';
import { dinoSvg } from '../../render/dinoSvg';
import { battleLog, eventToText, type NameResolver } from '../components/battleLog';
import { commandBar as buildCommandBar } from '../components/commandBar';
import { dinoCard, type DinoCardHandle } from '../components/dinoCard';
import { dateOrUrlSeed } from '../devSeed';
import { el, modal, tooltip, type ModalHandle } from '../dom';
import type { Screen, GameContext } from '../screenManager';
import { svgIcon } from '../svgIcon';
import type {
  BattleAction,
  BattleEvent,
  BattleState,
  Combatant,
  CommandId,
  DinoInstance,
  MoveDef,
  MoveId,
  Uid,
} from '../../core/types';

export interface BattleFinishResult {
  outcome: 'victory' | 'defeat' | 'fled';
  tamedUid?: Uid;
  /** Human-readable battle-log lines, oldest first — Phase 6's reward screen can summarize from these. */
  eventsSummary: string[];
}

export interface BattleScreenProps {
  battle: BattleState;
  playerDinos: DinoInstance[];
  reserve: DinoInstance[];
  onFinish: (result: BattleFinishResult) => void;
}

interface SlotEntry {
  uid: Uid;
  handle: DinoCardHandle;
}

interface SideRow {
  container: HTMLElement;
  facing: 'left' | 'right';
  slots: SlotEntry[];
}

const ENEMY_PACING_MS = 600;

function targetOf(action: BattleAction): Uid | undefined {
  if (action.type === 'move') return action.target;
  if (action.type === 'command') return action.target;
  return undefined;
}

function livingOn(battle: BattleState, side: Combatant['side']): Combatant[] {
  return battle.combatants.filter((c) => c.side === side && !c.fainted);
}

export function battleScreen(props: BattleScreenProps): Screen {
  const battle = props.battle;
  const rng = createRng(dateOrUrlSeed());
  const logHandle = battleLog();
  const summaryLines: string[] = [];
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;
  let activeTargetOptions: BattleAction[] = [];
  let activeTargetUids: Set<Uid> | null = null;

  function resolveName(uid: Uid): string {
    return battle.combatants.find((c) => c.uid === uid)?.nickname ?? uid;
  }
  const nameResolver: NameResolver = resolveName;

  function schedule(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timeouts.delete(id);
      if (!disposed) fn();
    }, ms);
    timeouts.add(id);
  }

  // -------------------------------------------------------------------
  // Static chrome
  // -------------------------------------------------------------------

  const bondsRow = el('div', { className: 'battle-bonds' });
  const roundLabel = el('div', { className: 'battle-round' });
  const roundBanner = el('div', { className: 'round-banner' });
  const actionPanel = el('div', { className: 'action-panel' });

  function buildRow(combatants: Combatant[], facing: 'left' | 'right'): SideRow {
    const slots: SlotEntry[] = combatants.map((c) => ({ uid: c.uid, handle: dinoCard(c, { variant: 'compact', facing }) }));
    const container = el(
      'div',
      { className: `battle-row battle-row-${facing === 'left' ? 'enemy' : 'player'}` },
      slots.map((s) => s.handle.root),
    );
    return { container, facing, slots };
  }

  const enemyRow = buildRow(livingOn(battle, 'enemy').length ? battle.combatants.filter((c) => c.side === 'enemy') : [], 'left');
  const playerRow = buildRow(battle.combatants.filter((c) => c.side === 'player'), 'right');

  const fieldEl = el(
    'div',
    { className: 'battle-field' },
    enemyRow.container,
    el('div', { className: 'battle-center-stage' }, roundBanner),
    playerRow.container,
  );

  fieldEl.addEventListener('click', (event) => {
    if (!activeTargetUids) return;
    const cardEl = (event.target as HTMLElement).closest('.dino-card') as HTMLElement | null;
    const uid = cardEl?.dataset.uid;
    if (!uid || !activeTargetUids.has(uid)) return;
    const action = activeTargetOptions.find((a) => targetOf(a) === uid);
    if (action) commit(action);
  });

  const root = el(
    'div',
    { className: 'battle-screen' },
    el('div', { className: 'battle-header' }, bondsRow, roundLabel),
    el('div', { className: 'battle-main' }, fieldEl, el('div', { className: 'battle-side-panel' }, logHandle.root)),
    el('div', { className: 'battle-footer' }, actionPanel),
  );

  // -------------------------------------------------------------------
  // Rendering helpers
  // -------------------------------------------------------------------

  function findSlot(uid: Uid): { row: SideRow; index: number } | undefined {
    for (const row of [enemyRow, playerRow]) {
      const index = row.slots.findIndex((s) => s.uid === uid);
      if (index !== -1) return { row, index };
    }
    return undefined;
  }

  function refreshCombatant(uid: Uid): void {
    const found = findSlot(uid);
    const c = battle.combatants.find((x) => x.uid === uid);
    if (found && c) found.row.slots[found.index]!.handle.update(c);
  }

  function refreshAll(): void {
    for (const c of battle.combatants) refreshCombatant(c.uid);
    roundLabel.textContent = `Round ${battle.round}`;
    bondsRow.replaceChildren(
      ...battle.playerBonds.map((bond) => {
        const chip = el('span', { className: `bond-chip bond-chip-${bond.kind}` }, bond.label);
        tooltip(chip, bond.detail);
        return chip;
      }),
    );
  }

  function rebuildSwapSlot(outUid: Uid, inUid: Uid): void {
    const found = findSlot(outUid);
    if (!found) return;
    const c = battle.combatants.find((x) => x.uid === inUid);
    if (!c) return;
    const newHandle = dinoCard(c, { variant: 'compact', facing: found.row.facing });
    found.row.container.replaceChild(newHandle.root, found.row.slots[found.index]!.handle.root);
    found.row.slots[found.index] = { uid: inUid, handle: newHandle };
  }

  function flashClass(uid: Uid, className: string, durationMs: number): void {
    const found = findSlot(uid);
    const cardEl = found?.row.slots[found.index]!.handle.root;
    if (!cardEl) return;
    cardEl.classList.remove(className);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void cardEl.offsetWidth; // restart CSS animation
    cardEl.classList.add(className);
    schedule(() => cardEl.classList.remove(className), durationMs);
  }

  function floatNumber(uid: Uid, text: string, kind: string): void {
    const found = findSlot(uid);
    const cardEl = found?.row.slots[found.index]!.handle.root;
    if (!cardEl) return;
    const node = el('div', { className: `floating-number floating-number-${kind}` }, text);
    cardEl.appendChild(node);
    schedule(() => node.remove(), 1000);
  }

  function showRoundBanner(round: number): void {
    roundBanner.textContent = `Round ${round}`;
    roundBanner.classList.remove('round-banner-show');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void roundBanner.offsetWidth;
    roundBanner.classList.add('round-banner-show');
  }

  // -------------------------------------------------------------------
  // Event presentation
  // -------------------------------------------------------------------

  function delayForEvent(event: BattleEvent): number {
    switch (event.e) {
      case 'roundStart':
        return 900;
      case 'faint':
      case 'tameAttempt':
        return 750;
      case 'moveUsed':
      case 'damage':
        return 500;
      default:
        return 420;
    }
  }

  function presentEvent(event: BattleEvent): void {
    switch (event.e) {
      case 'roundStart':
        showRoundBanner(event.round);
        break;
      case 'moveUsed':
        flashClass(event.uid, 'anim-lunge', 400);
        break;
      case 'damage': {
        flashClass(event.uid, 'anim-shake', 400);
        const kind = event.crit ? 'crit' : event.effective === 'weak' ? 'weak' : event.effective === 'strong' ? 'strong' : 'normal';
        floatNumber(event.uid, `-${event.amount}`, kind);
        refreshCombatant(event.uid);
        break;
      }
      case 'heal':
        floatNumber(event.uid, `+${event.amount}`, 'heal');
        refreshCombatant(event.uid);
        break;
      case 'shield':
        floatNumber(event.uid, `+${event.amount}`, 'shield');
        refreshCombatant(event.uid);
        break;
      case 'statusApplied':
      case 'statusExpired':
      case 'statusTick':
      case 'buff':
        refreshCombatant(event.uid);
        break;
      case 'faint':
        flashClass(event.uid, 'anim-faint', 700);
        refreshCombatant(event.uid);
        break;
      case 'swap':
        rebuildSwapSlot(event.outUid, event.inUid);
        break;
      case 'guard':
        flashClass(event.uid, 'anim-guard', 400);
        refreshCombatant(event.uid);
        break;
      case 'tameAttempt':
        flashClass(event.uid, event.success ? 'anim-tame-success' : 'anim-tame-fail', 700);
        refreshCombatant(event.uid);
        break;
      default:
        break;
    }
    logHandle.append([event], nameResolver);
    summaryLines.push(eventToText(event, nameResolver));
  }

  function animateSequential(events: BattleEvent[], index: number, done: () => void): void {
    if (disposed) return;
    if (index >= events.length) {
      done();
      return;
    }
    const event = events[index]!;
    presentEvent(event);
    schedule(() => animateSequential(events, index + 1, done), delayForEvent(event));
  }

  // -------------------------------------------------------------------
  // Turn loop
  // -------------------------------------------------------------------

  function currentActor(): Combatant | undefined {
    const uid = battle.turnQueue[battle.turnIndex];
    return uid !== undefined ? battle.combatants.find((c) => c.uid === uid) : undefined;
  }

  function proceed(): void {
    if (isBattleOver(battle)) {
      showEndOverlay();
      return;
    }
    const actor = currentActor();
    if (!actor) return;
    if (actor.side === 'enemy') {
      hideActionPanel();
      schedule(() => {
        const action = chooseAction(battle, rng);
        commitInternal(action, actor.side);
      }, ENEMY_PACING_MS);
    } else {
      showActionPanel(actor);
    }
  }

  function commitInternal(action: BattleAction, _actingSide: Combatant['side']): void {
    exitTargetMode();
    const events = applyAction(battle, action, rng);
    const consumesTurn = action.type !== 'command';
    hideActionPanel();
    animateSequential(events, 0, () => {
      refreshAll();
      if (isBattleOver(battle)) {
        showEndOverlay();
        return;
      }
      if (consumesTurn) {
        proceed();
      } else {
        const actor = currentActor();
        if (actor) showActionPanel(actor);
      }
    });
  }

  function commit(action: BattleAction): void {
    const actor = currentActor();
    commitInternal(action, actor?.side ?? 'player');
  }

  // -------------------------------------------------------------------
  // Targeting mode
  // -------------------------------------------------------------------

  function enterTargetMode(options: BattleAction[]): void {
    exitTargetMode();
    const uids = new Set<Uid>();
    for (const option of options) {
      const uid = targetOf(option);
      if (uid) uids.add(uid);
    }
    activeTargetUids = uids;
    activeTargetOptions = options;
    for (const uid of uids) {
      const found = findSlot(uid);
      found?.row.slots[found.index]!.handle.root.classList.add('dino-card-targetable');
    }
  }

  function exitTargetMode(): void {
    if (activeTargetUids) {
      for (const uid of activeTargetUids) {
        const found = findSlot(uid);
        found?.row.slots[found.index]!.handle.root.classList.remove('dino-card-targetable');
      }
    }
    activeTargetUids = null;
    activeTargetOptions = [];
  }

  // -------------------------------------------------------------------
  // Reserve picker (swap / recall)
  // -------------------------------------------------------------------

  function openReservePicker(options: BattleAction[]): void {
    const dinoByUid = new Map(props.reserve.map((d) => [d.uid, d]));
    let handle: ModalHandle | undefined;
    const rows = options
      .map((action) => {
        const uid = targetOf(action) ?? (action.type === 'swap' ? action.withDino : undefined);
        const dino = uid ? dinoByUid.get(uid) : undefined;
        if (!dino) return null;
        const species = SPECIES[dino.species];
        const thumb = species
          ? svgIcon(dinoSvg({ species, stage: stageForLevel(dino.level), seed: dino.appearanceSeed, size: 56 }), 'reserve-picker-thumb')
          : null;
        return el(
          'div',
          {
            className: 'reserve-picker-row',
            onClick: () => {
              handle?.close();
              commit(action);
            },
          },
          thumb,
          el(
            'div',
            null,
            el('div', { className: 'reserve-picker-name' }, dino.nickname),
            el('div', { className: 'reserve-picker-meta' }, `Lv.${dino.level} · ${Math.round(dino.currentHpPercent * 100)}% HP`),
          ),
        );
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    handle = modal({ title: 'Choose a dino', content: el('div', { className: 'reserve-picker' }, rows) });
  }

  // -------------------------------------------------------------------
  // Action panel (player turn)
  // -------------------------------------------------------------------

  function moveTooltipText(actor: Combatant, moveDef: MoveDef | undefined, usable: boolean, cooldown: number): string {
    if (!moveDef) return '';
    const lines: string[] = [moveDef.description];
    if (!usable) {
      if (cooldown > 0) lines.push(`On cooldown (${cooldown} more turn${cooldown === 1 ? '' : 's'}).`);
      else if (actor.statuses.some((s) => s.id === 'stun')) lines.push('Stunned — cannot act.');
    }
    if (moveDef.targets === 'enemy' || moveDef.targets === 'all-enemies') {
      const enemySide = actor.side === 'player' ? 'enemy' : 'player';
      for (const foe of livingOn(battle, enemySide)) {
        const foeSpecies = SPECIES[foe.species];
        if (!foeSpecies) continue;
        const mult = aspectMultiplier(moveDef.aspect, foeSpecies.aspect);
        const tag = mult > 1 ? 'Strong' : mult < 1 ? 'Weak' : 'Neutral';
        lines.push(`vs ${foe.nickname}: ${tag} (${mult}x)`);
      }
    }
    return lines.join(' — ');
  }

  function buildMoveButton(actor: Combatant, moveId: MoveId, legal: BattleAction[]): HTMLElement {
    const moveDef = MOVES[moveId];
    const options = legal.filter((a): a is Extract<BattleAction, { type: 'move' }> => a.type === 'move' && a.move === moveId);
    const cooldown = actor.cooldowns[moveId] ?? 0;
    const usable = options.length > 0;
    const btn = el(
      'button',
      {
        className: `btn move-btn move-btn-aspect-${moveDef?.aspect ?? 'ember'}`,
        disabled: !usable,
        onClick: () => {
          if (options.length === 1) commit(options[0]!);
          else if (options.length > 1) enterTargetMode(options);
        },
      },
      el('span', { className: 'move-btn-name' }, moveDef?.name ?? moveId),
      cooldown > 0 ? el('span', { className: 'move-btn-cooldown' }, `CD ${cooldown}`) : null,
    );
    tooltip(btn, () => moveTooltipText(actor, moveDef, usable, cooldown));
    return btn;
  }

  function findTameTarget(): Combatant | undefined {
    const candidates = battle.combatants.filter(
      (c) => c.side === 'enemy' && !c.fainted && c.tameable && c.stats.hp > 0 && c.currentHp / c.stats.hp < TAME_HP_ELIGIBLE_THRESHOLD,
    );
    if (candidates.length === 0) return undefined;
    return candidates.reduce((a, b) => (a.currentHp / a.stats.hp <= b.currentHp / b.stats.hp ? a : b));
  }

  function handleCommand(commandId: CommandId, legal: BattleAction[]): void {
    const options = legal.filter((a): a is Extract<BattleAction, { type: 'command' }> => a.type === 'command' && a.command === commandId);
    if (options.length === 0) return;
    if (options.length === 1) {
      commit(options[0]!);
      return;
    }
    const def = COMMANDS[commandId];
    if (def?.effect.kind === 'freeSwap') openReservePicker(options);
    else enterTargetMode(options);
  }

  function hideActionPanel(): void {
    exitTargetMode();
    actionPanel.replaceChildren();
  }

  function showActionPanel(actor: Combatant): void {
    const legal = legalActions(battle);

    const moveButtons = el('div', { className: 'action-moves' }, actor.moves.map((moveId) => buildMoveButton(actor, moveId, legal)));

    const guardBtn = el('button', { className: 'btn action-btn', onClick: () => commit({ type: 'guard' }) }, 'Guard');

    const swapOptions = legal.filter((a): a is Extract<BattleAction, { type: 'swap' }> => a.type === 'swap');
    const swapBtn = el(
      'button',
      { className: 'btn action-btn', disabled: swapOptions.length === 0, onClick: () => openReservePicker(swapOptions) },
      'Swap',
    );

    const tameTarget = findTameTarget();
    const tameOptions = legal.filter((a) => a.type === 'tame');
    const ctx: TameContext = { lureActive: battle.lureActive, skillTameChancePercent: 0, affixTameChancePercent: 0 };
    const chance = tameTarget ? tameChance(tameTarget, ctx) : 0;
    const tameBtn = el(
      'button',
      { className: 'btn action-btn action-btn-tame', disabled: tameOptions.length === 0, onClick: () => commit({ type: 'tame' }) },
      tameOptions.length > 0 ? `Tame (${Math.round(chance * 100)}%+)` : 'Tame',
    );
    if (tameOptions.length > 0) tooltip(tameBtn, 'Chance shown excludes Handler skills/gear bonuses (not visible to the UI layer) — actual odds are equal or higher.');

    const cmdBar = buildCommandBar({
      commands: battle.commands,
      disabled: battle.commandUsedThisRound,
      onSelect: (commandId) => handleCommand(commandId, legalActions(battle)),
    });

    actionPanel.replaceChildren(
      el('div', { className: 'action-panel-title' }, `${actor.nickname}'s turn`),
      moveButtons,
      el('div', { className: 'action-buttons' }, guardBtn, swapBtn, tameBtn),
      cmdBar.root,
    );
  }

  // -------------------------------------------------------------------
  // End-of-battle overlay
  // -------------------------------------------------------------------

  function showEndOverlay(): void {
    hideActionPanel();
    const outcome = battle.outcome ?? 'defeat';
    const tamedUid = battle.tamed;
    const title = outcome === 'victory' ? 'Victory!' : outcome === 'defeat' ? 'Defeat' : 'The Pack Retreats';
    const body =
      outcome === 'victory'
        ? 'The wild pack is defeated.'
        : outcome === 'defeat'
          ? 'Your pack falls back to camp, keeping its XP and half its loot.'
          : 'The battle ends without a clean result.';
    const handle = modal({
      title,
      content: el('div', { className: 'battle-end-content' }, body, tamedUid ? el('div', { className: 'battle-end-tame' }, `${resolveName(tamedUid)} joins your pack!`) : null),
      actions: [
        {
          label: 'Continue',
          primary: true,
          onClick: () => {
            handle.close();
            props.onFinish({ outcome, tamedUid, eventsSummary: [...summaryLines] });
          },
        },
      ],
    });
  }

  return {
    mount(mountRoot: HTMLElement, _ctx: GameContext): void {
      mountRoot.appendChild(root);
      refreshAll();
      logHandle.append([{ e: 'roundStart', round: battle.round }], nameResolver);
      proceed();
    },
    unmount(): void {
      disposed = true;
      for (const id of timeouts) clearTimeout(id);
      timeouts.clear();
      root.remove();
    },
  };
}
