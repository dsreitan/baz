/**
 * Battle log: scrolling human-readable feed of `BattleEvent`s.
 *
 * `eventToText` is a pure function (no DOM) so it's unit-testable on its
 * own; `battleLog()` is the thin DOM wrapper that appends lines and keeps
 * the view scrolled to the newest entry. One event -> one line; a
 * `moveUsed` line followed by its `damage` line reads exactly like the
 * "Emberfang used Magma Bite! Critical! Strong hit — 42 damage." example
 * from the brief, just split across two consecutive log lines.
 */
import { COMMANDS, MOVES } from '../../data/index';
import { statusLabel } from '../../render/icons';
import { el } from '../dom';
import type { BattleEvent, Uid } from '../../core/types';

export type NameResolver = (uid: Uid) => string;

function moveName(moveId: string): string {
  return MOVES[moveId]?.name ?? moveId;
}

function commandName(commandId: string): string {
  return COMMANDS[commandId]?.name ?? commandId;
}

function pctText(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Render one `BattleEvent` as a single human-readable log line. */
export function eventToText(event: BattleEvent, resolveName: NameResolver): string {
  switch (event.e) {
    case 'roundStart':
      return `— Round ${event.round} —`;
    case 'turnStart':
      return `${resolveName(event.uid)}'s turn.`;
    case 'moveUsed':
      return `${resolveName(event.uid)} used ${moveName(event.move)}!`;
    case 'damage': {
      const bits: string[] = [];
      if (event.crit) bits.push('Critical!');
      if (event.effective === 'strong') bits.push('Strong hit!');
      else if (event.effective === 'weak') bits.push('Not very effective.');
      bits.push(`${event.amount} damage to ${resolveName(event.uid)}.`);
      return bits.join(' ');
    }
    case 'comboConsumed': {
      const bonus = event.bonus.startsWith('bonusDamage')
        ? 'a damage bonus'
        : event.bonus === 'guaranteedCrit'
          ? 'a guaranteed critical'
          : 'ignored defense';
      return `${resolveName(event.uid)} cashes in ${statusLabel(event.status)} for ${bonus}!`;
    }
    case 'heal':
      return `${resolveName(event.uid)} recovers ${event.amount} HP.`;
    case 'shield':
      return `${resolveName(event.uid)} raises a ${event.amount} HP shield.`;
    case 'statusApplied':
      return `${resolveName(event.uid)} is afflicted with ${statusLabel(event.status)} (${event.turns} turn${event.turns === 1 ? '' : 's'}).`;
    case 'statusExpired':
      return `${statusLabel(event.status)} fades from ${resolveName(event.uid)}.`;
    case 'statusTick':
      return `${resolveName(event.uid)} takes ${event.amount} from ${statusLabel(event.status)}.`;
    case 'buff':
      return `${resolveName(event.uid)}'s ${event.stat.toUpperCase()} ${event.percent >= 0 ? 'rises' : 'falls'} by ${Math.abs(event.percent)}%.`;
    case 'miss':
      return `${moveName(event.move)} misses ${resolveName(event.uid)}!`;
    case 'faint':
      return `${resolveName(event.uid)} has fainted!`;
    case 'swap':
      return `${resolveName(event.outUid)} swaps out for ${resolveName(event.inUid)}.`;
    case 'guard':
      return `${resolveName(event.uid)} braces to guard.`;
    case 'tameAttempt':
      return event.success
        ? `Tame attempt on ${resolveName(event.uid)} succeeds! (${pctText(event.chance)} chance)`
        : `Tame attempt on ${resolveName(event.uid)} fails. (${pctText(event.chance)} chance)`;
    case 'command':
      return event.target
        ? `Command used: ${commandName(event.command)} on ${resolveName(event.target)}.`
        : `Command used: ${commandName(event.command)}.`;
    case 'battleEnd':
      if (event.outcome === 'victory') return 'Victory! The wild pack is defeated.';
      if (event.outcome === 'defeat') return 'Defeat... the pack falls back to camp.';
      return 'The wild dinos flee!';
  }
}

export interface BattleLogHandle {
  root: HTMLElement;
  append(events: BattleEvent[], resolveName: NameResolver): void;
  clear(): void;
}

export function battleLog(): BattleLogHandle {
  const root = el('div', { className: 'battle-log' });

  function append(events: BattleEvent[], resolveName: NameResolver): void {
    for (const event of events) {
      const line = el('div', { className: `battle-log-line battle-log-${event.e}` }, eventToText(event, resolveName));
      root.appendChild(line);
    }
    root.scrollTop = root.scrollHeight;
  }

  function clear(): void {
    root.replaceChildren();
  }

  return { root, append, clear };
}
