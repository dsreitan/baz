/**
 * Packmaster Commands — one usable per battle round, no turn cost.
 * Rally and Field Dressing are available from level 1 (DEFAULT_COMMANDS);
 * the rest are unlocked through Tactician skills (see skills.ts).
 * Conventions: `percent` is a whole number (20 = 20%); `percentMaxHp` is a
 * fraction 0..1 to match MoveEffect heal.
 */
import type { CommandDef, CommandId } from '../core/types';

export const COMMAND_LIST: CommandDef[] = [
  {
    id: 'rally',
    name: 'Rally',
    description: 'The whole pack gains +20% ATK this round.',
    effect: { kind: 'teamBuff', stat: 'atk', percent: 20 },
  },
  {
    id: 'field_dressing',
    name: 'Field Dressing',
    description: 'Patch up one dino for 25% of its max HP.',
    effect: { kind: 'healTarget', percentMaxHp: 0.25 },
  },
  {
    id: 'throw_lure',
    name: 'Throw Lure',
    description: 'Bait the field — the next tame attempt this battle gets a large bonus.',
    effect: { kind: 'lure' },
  },
  {
    id: 'recall',
    name: 'Recall',
    description: 'Swap one active dino with a reserve dino without spending a turn.',
    effect: { kind: 'freeSwap' },
  },
  {
    id: 'focus',
    name: 'Focus',
    description: 'One dino shakes off its fatigue — all of its cooldowns reset.',
    effect: { kind: 'resetCooldowns', target: 'one' },
  },
  {
    id: 'cleanse',
    name: 'Cleanse',
    description: 'Remove all negative statuses from the whole pack.',
    effect: { kind: 'cleanseTeam' },
  },
];

/** Commands every new Packmaster starts with. */
export const DEFAULT_COMMANDS: CommandId[] = ['rally', 'field_dressing'];
