/**
 * `eventToText` is deliberately a pure function (no DOM) so every
 * `BattleEvent` variant can be exercised in plain vitest without happy-dom.
 * (Importing battleLog.ts pulls in ui/dom.ts, but dom.ts only touches
 * `document` inside functions — module load is DOM-free.)
 */
import { describe, expect, it } from 'vitest';
import { MOVE_LIST, COMMAND_LIST } from '../../data/index';
import type { BattleEvent, Uid } from '../../core/types';
import { eventToText } from './battleLog';

const NAMES: Record<Uid, string> = {
  u1: 'Emberfang',
  u2: 'Frostmaw',
  u3: 'Voltspur',
};

function resolve(uid: Uid): string {
  return NAMES[uid] ?? uid;
}

const move = MOVE_LIST[0]!.id;
const command = COMMAND_LIST[0]!.id;

/** One synthetic event per BattleEvent variant (and per interesting branch). */
const SYNTHETIC_EVENTS: BattleEvent[] = [
  { e: 'roundStart', round: 3 },
  { e: 'turnStart', uid: 'u1' },
  { e: 'moveUsed', uid: 'u1', move, targets: ['u2'] },
  { e: 'moveUsed', uid: 'u1', move: 'not_a_real_move', targets: ['u2'] },
  { e: 'damage', uid: 'u2', amount: 42, crit: true, effective: 'strong' },
  { e: 'damage', uid: 'u2', amount: 7, crit: false, effective: 'weak' },
  { e: 'damage', uid: 'u2', amount: 20, crit: false, effective: 'neutral' },
  { e: 'comboConsumed', uid: 'u1', status: 'soak', bonus: 'bonusDamage:0.5' },
  { e: 'comboConsumed', uid: 'u1', status: 'chill', bonus: 'guaranteedCrit' },
  { e: 'comboConsumed', uid: 'u1', status: 'knockdown', bonus: 'ignoreDef' },
  { e: 'heal', uid: 'u1', amount: 18 },
  { e: 'shield', uid: 'u1', amount: 25 },
  { e: 'statusApplied', uid: 'u2', status: 'burn', turns: 2 },
  { e: 'statusApplied', uid: 'u2', status: 'stun', turns: 1 },
  { e: 'statusExpired', uid: 'u2', status: 'burn' },
  { e: 'statusTick', uid: 'u2', status: 'poison', amount: 6 },
  { e: 'buff', uid: 'u1', stat: 'atk', percent: 20 },
  { e: 'buff', uid: 'u2', stat: 'spd', percent: -15 },
  { e: 'miss', uid: 'u2', move },
  { e: 'faint', uid: 'u2' },
  { e: 'swap', outUid: 'u1', inUid: 'u3' },
  { e: 'guard', uid: 'u1' },
  { e: 'tameAttempt', uid: 'u2', chance: 0.42, success: true },
  { e: 'tameAttempt', uid: 'u2', chance: 0.42, success: false },
  { e: 'command', command },
  { e: 'command', command, target: 'u1' },
  { e: 'command', command: 'unknown_command', target: 'u1' },
  { e: 'battleEnd', outcome: 'victory' },
  { e: 'battleEnd', outcome: 'defeat' },
  { e: 'battleEnd', outcome: 'fled' },
];

describe('eventToText', () => {
  it('renders non-empty text for every BattleEvent variant without throwing', () => {
    // Cross-check that we actually cover every variant of the union.
    const covered = new Set(SYNTHETIC_EVENTS.map((ev) => ev.e));
    expect([...covered].sort()).toEqual(
      [
        'roundStart',
        'turnStart',
        'moveUsed',
        'damage',
        'comboConsumed',
        'heal',
        'shield',
        'statusApplied',
        'statusExpired',
        'statusTick',
        'buff',
        'miss',
        'faint',
        'swap',
        'guard',
        'tameAttempt',
        'command',
        'battleEnd',
      ].sort(),
    );

    for (const event of SYNTHETIC_EVENTS) {
      const text = eventToText(event, resolve);
      expect(typeof text, event.e).toBe('string');
      expect(text.length, `${event.e} non-empty`).toBeGreaterThan(0);
    }
  });

  it('resolves names through the provided resolver', () => {
    expect(eventToText({ e: 'faint', uid: 'u2' }, resolve)).toContain('Frostmaw');
    expect(eventToText({ e: 'swap', outUid: 'u1', inUid: 'u3' }, resolve)).toContain('Voltspur');
  });

  it('formats damage flavor in the briefed style', () => {
    const text = eventToText({ e: 'damage', uid: 'u2', amount: 42, crit: true, effective: 'strong' }, resolve);
    expect(text).toContain('Critical!');
    expect(text).toContain('Strong hit!');
    expect(text).toContain('42 damage');
  });

  it('shows the tame chance as a percentage', () => {
    const text = eventToText({ e: 'tameAttempt', uid: 'u2', chance: 0.42, success: false }, resolve);
    expect(text).toContain('42%');
    expect(text).toContain('fails');
  });

  it('uses real move/command display names from data', () => {
    const usedText = eventToText({ e: 'moveUsed', uid: 'u1', move, targets: ['u2'] }, resolve);
    expect(usedText).toContain(MOVE_LIST[0]!.name);
    const cmdText = eventToText({ e: 'command', command }, resolve);
    expect(cmdText).toContain(COMMAND_LIST[0]!.name);
  });
});
