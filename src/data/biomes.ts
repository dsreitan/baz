/**
 * Biomes — six expedition destinations, each biasing two aspects, with an
 * overlapping wild species pool and a unique apex boss. Palettes feed the
 * expedition map background.
 */
import type { BiomeDef } from '../core/types';

export const BIOME_LIST: BiomeDef[] = [
  {
    id: 'cinder_peaks',
    name: 'Cinder Peaks',
    description:
      'Ash-choked volcano country. Lava seams glow in the switchbacks and everything smells of struck flint.',
    aspectBias: ['ember', 'stone'],
    speciesPool: ['emberfang', 'cinderwing', 'ashbrow', 'cragmaul', 'bouldershell', 'runeclaw'],
    apexSpecies: 'pyrelord_rex',
    palette: { bg: '#3a1f1a', accent: '#ff6a2b' },
  },
  {
    id: 'frostfen',
    name: 'Frostfen',
    description:
      'A half-frozen marsh under a low grey sky, where the ice groans and the fog hides things that do not mind the cold.',
    aspectBias: ['frost', 'tide'],
    speciesPool: ['frostmaw', 'glacierhide', 'riptalon', 'tidecaller', 'bouldershell'],
    apexSpecies: 'rimehorn_tyrant',
    palette: { bg: '#1c2b3a', accent: '#9fd8ff' },
  },
  {
    id: 'verdant_maw',
    name: 'Verdant Maw',
    description:
      'Jungle so dense it swallows daylight. The canopy drips, the roots move, and the green is always hungry.',
    aspectBias: ['verdant', 'venom'],
    speciesPool: ['thornback', 'bloomcrest', 'venomlash', 'mirewing', 'glyphhorn'],
    apexSpecies: 'canopy_devourer',
    palette: { bg: '#16301c', accent: '#5ad06a' },
  },
  {
    id: 'stormreach_cliffs',
    name: 'Stormreach Cliffs',
    description:
      'Sheer sea-cliffs crowned in permanent thunderheads. The wind carries sparks, and old glyphs hum in the rock.',
    aspectBias: ['storm', 'rune'],
    speciesPool: ['voltspur', 'galecrest', 'runeclaw', 'glyphhorn', 'cinderwing', 'riptalon'],
    apexSpecies: 'tempest_sovereign',
    palette: { bg: '#2a2440', accent: '#ffd84d' },
  },
  {
    id: 'sunken_coast',
    name: 'Sunken Coast',
    description:
      'A drowned shoreline of tide pools, wrecks, and brine-slick caves. The sea gives, and the sea collects.',
    aspectBias: ['tide', 'storm'],
    speciesPool: ['riptalon', 'tidecaller', 'riverjaw', 'voltspur', 'galecrest', 'glacierhide'],
    apexSpecies: 'abyssal_maw',
    palette: { bg: '#0f2f38', accent: '#3fd2c7' },
  },
  {
    id: 'miregloom',
    name: 'Miregloom',
    description:
      'A lightless swamp of black water and phosphorescent rot. Even the insects whisper here.',
    aspectBias: ['venom', 'rune'],
    speciesPool: ['venomlash', 'mirewing', 'runeclaw', 'glyphhorn', 'thornback', 'riverjaw'],
    apexSpecies: 'blightcrest_ancient',
    palette: { bg: '#241a2e', accent: '#a06bd4' },
  },
];
