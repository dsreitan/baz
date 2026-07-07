/**
 * Game title, tagline, and common UI strings. Renaming the game is a
 * find-and-replace in this file only.
 */

export const GAME_TITLE = 'Clawbound';

export const GAME_TAGLINE = 'Tame the wilds. Bind the pack. Hunt the apex.';

/** Common UI strings, keyed for reuse across screens. */
export const UI = {
  // Main menu
  newGame: 'New Expedition Log',
  continueGame: 'Continue',
  loadGame: 'Load Game',
  exportSave: 'Export Save',
  importSave: 'Import Save',
  emptySlot: 'Empty Slot',
  chooseStarter: 'Choose your first companion',

  // Camp
  camp: 'Camp',
  pack: 'Pack',
  gear: 'Gear',
  skills: 'Skills',
  startExpedition: 'Start Expedition',
  chooseBiome: 'Choose a biome',
  worldTier: 'World Tier',
  healAll: 'Rest the Pack',
  essence: 'Essence',

  // Pack management
  activePack: 'Active Pack',
  reserve: 'Reserve',
  release: 'Release',
  moves: 'Moves',
  trait: 'Trait',
  quirk: 'Quirk',

  // Gear
  equip: 'Equip',
  unequip: 'Unequip',
  salvage: 'Salvage',
  upgrade: 'Upgrade',
  inventory: 'Inventory',

  // Battle
  battle: 'Battle',
  guard: 'Guard',
  swap: 'Swap',
  tame: 'Tame',
  command: 'Command',
  victory: 'Victory!',
  defeat: 'Defeat',
  fled: 'Fled',
  tameSuccess: 'joined the pack!',
  tameFail: 'shakes off the attempt and rages!',
  cooldown: 'Cooldown',
  round: 'Round',

  // Expedition
  expedition: 'Expedition',
  nodeBattle: 'Wild Pack',
  nodeAlpha: 'Alpha',
  nodeEvent: 'Event',
  nodeGrove: 'Grove',
  nodeCache: 'Cache',
  nodeApex: 'Apex',
  expeditionSummary: 'Expedition Summary',
  lootFound: 'Loot Found',
  xpEarned: 'XP Earned',

  // Generic
  confirm: 'Confirm',
  cancel: 'Cancel',
  back: 'Back',
  close: 'Close',
  level: 'Lv.',
} as const;
