/**
 * Expedition events — choice vignettes resolved by the expedition runner.
 * Conventions: `healTeam`/`damageTeam` percents are whole numbers (25 = 25%
 * of max HP); `risk.chance` is the probability of the labeled outcome,
 * otherwise `risk.else` resolves.
 */
import type { EventDef } from '../core/types';

export const EVENT_LIST: EventDef[] = [
  {
    id: 'abandoned_nest',
    title: 'Abandoned Nest',
    text:
      'A ring of crushed ferns cradles a clutch of unhatched eggs, still warm. Whatever guarded it left in a hurry — or was made to.',
    choices: [
      {
        label: 'Harvest the eggs for essence',
        outcome: { kind: 'essence', amount: 25 },
      },
      {
        label: 'Search the nest lining for hidden treasures',
        outcome: { kind: 'loot', rarityBoost: 1 },
        risk: { chance: 0.6, else: { kind: 'damageTeam', percent: 15 } },
      },
      {
        label: 'Leave it be',
        outcome: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'hot_springs',
    title: 'Hot Springs',
    text:
      'Steam curls off a chain of mineral pools. Your pack noses at the water, tails wagging like hatchlings.',
    choices: [
      {
        label: 'Let the pack soak',
        outcome: { kind: 'healTeam', percent: 40 },
      },
      {
        label: 'Dredge the glittering pool bed',
        outcome: { kind: 'loot', rarityBoost: 1 },
        risk: { chance: 0.7, else: { kind: 'damageTeam', percent: 10 } },
      },
    ],
  },
  {
    id: 'bone_totem',
    title: 'Bone Totem',
    text:
      'A totem of stacked skulls looms over the trail, bound with sinew and humming faintly. Old packmaster work — or something older.',
    choices: [
      {
        label: 'Study the carvings',
        outcome: { kind: 'xp', amount: 40 },
      },
      {
        label: 'Smash it open for the essence inside',
        outcome: { kind: 'essence', amount: 35 },
        risk: { chance: 0.5, else: { kind: 'damageTeam', percent: 20 } },
      },
      {
        label: 'Give it a wide berth',
        outcome: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'stranded_hatchling',
    title: 'Stranded Hatchling',
    text:
      'A hatchling squeaks from a mud pit, too small to climb out. Its parents are nowhere in sight. Probably.',
    choices: [
      {
        label: 'Haul it out and see it home',
        outcome: { kind: 'xp', amount: 60 },
        risk: { chance: 0.75, else: { kind: 'damageTeam', percent: 15 } },
      },
      {
        label: 'Keep walking',
        outcome: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'glowing_cache',
    title: 'Glowing Cache',
    text:
      'Half-buried under a rockfall, a strapped chest pulses with runelight. The straps are not rotted. Someone meant to come back.',
    choices: [
      {
        label: 'Pry it open here and now',
        outcome: { kind: 'loot', rarityBoost: 2 },
        risk: { chance: 0.5, else: { kind: 'damageTeam', percent: 25 } },
      },
      {
        label: 'Work it free carefully',
        outcome: { kind: 'loot', rarityBoost: 0 },
      },
      {
        label: 'Not worth the risk',
        outcome: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'alpha_tracks',
    title: 'Alpha Tracks',
    text:
      'Prints as long as your arm, pressed deep, still filling with water. Whatever made them is close, and it is not hiding.',
    choices: [
      {
        label: 'Follow the trail and take it down',
        outcome: { kind: 'battle', alpha: true },
      },
      {
        label: 'Circle far around',
        outcome: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'carrion_feast',
    title: 'Carrion Feast',
    text:
      'A fresh kill lies abandoned in a clearing — a mountain of meat, barely touched. Your pack is already drooling. Nothing abandons a kill like this.',
    choices: [
      {
        label: 'Let the pack gorge',
        outcome: { kind: 'healTeam', percent: 30 },
        risk: { chance: 0.7, else: { kind: 'damageTeam', percent: 10 } },
      },
      {
        label: 'Harvest what you can carry',
        outcome: { kind: 'essence', amount: 20 },
      },
      {
        label: 'Back away slowly',
        outcome: { kind: 'nothing' },
      },
    ],
  },
  {
    id: 'packmasters_grave',
    title: 'Packmaster’s Grave',
    text:
      'A cairn topped with a cracked whistle. Lean bones rest beneath it — a packmaster, and around the cairn, the smaller bones of a pack that never left.',
    choices: [
      {
        label: 'Pay your respects and take the lesson',
        outcome: { kind: 'xp', amount: 50 },
      },
      {
        label: 'Dig for whatever was buried with them',
        outcome: { kind: 'loot', rarityBoost: 1 },
        risk: { chance: 0.6, else: { kind: 'nothing' } },
      },
    ],
  },
  {
    id: 'sudden_squall',
    title: 'Sudden Squall',
    text:
      'The sky closes like a jaw. Rain comes in sideways, and somewhere ahead the trail is washing out by the minute.',
    choices: [
      {
        label: 'Shelter under a rock shelf and rest',
        outcome: { kind: 'healTeam', percent: 20 },
      },
      {
        label: 'Push through the storm to save time',
        outcome: { kind: 'xp', amount: 30 },
        risk: { chance: 0.65, else: { kind: 'damageTeam', percent: 20 } },
      },
    ],
  },
  {
    id: 'mirror_pool',
    title: 'Mirror Pool',
    text:
      'A perfectly still pool reflects a sky that is not quite the one above you. Runes ring the waterline, worn almost smooth.',
    choices: [
      {
        label: 'Let the pack drink deep',
        outcome: { kind: 'healTeam', percent: 50 },
        risk: { chance: 0.5, else: { kind: 'damageTeam', percent: 25 } },
      },
      {
        label: 'Study the reflection',
        outcome: { kind: 'xp', amount: 40 },
      },
      {
        label: 'Bottle some of the water',
        outcome: { kind: 'essence', amount: 15 },
      },
    ],
  },
];
