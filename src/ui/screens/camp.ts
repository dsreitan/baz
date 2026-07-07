/**
 * Camp — the persistent hub (ARCHITECTURE §4, DESIGN §3/§6/§7): pack
 * summary, navigation to Pack/Gear/Skill Tree, free Heal & Rest, and the
 * expedition launcher (biome + World Tier picker → `generateExpedition`).
 * Autosaves on every entry and again immediately before an expedition
 * starts, per the Phase 6 brief.
 */
import { generateExpedition } from '../../core/gen/expedition';
import { masterXpForLevel } from '../../core/progression';
import { createRng } from '../../core/rng';
import { canFieldActivePack, healAllDinos, reserveSize } from '../../core/run';
import type { BiomeId, WorldTier } from '../../core/types';
import { BIOME_LIST, SPECIES, UI } from '../../data/index';
import { aspectIcon, essenceIcon } from '../../render/icons';
import { dinoSvg } from '../../render/dinoSvg';
import { dinoCard } from '../components/dinoCard';
import { dinoToCombatant } from '../dinoPreview';
import { el, toast } from '../dom';
import type { GameContext, Screen } from '../screenManager';
import { svgIcon } from '../svgIcon';
import { expeditionMap } from './expeditionMap';
import { gearScreen } from './gearScreen';
import { packScreen } from './packScreen';
import { skillTree } from './skillTree';

const WORLD_TIERS: WorldTier[] = [1, 2, 3, 4];

export function camp(): Screen {
  let root: HTMLElement | null = null;
  let selectedBiome: BiomeId = BIOME_LIST[0]!.id;
  let selectedTier: WorldTier = 1;

  function render(ctx: GameContext): void {
    if (!root) return;
    const state = ctx.state;
    selectedTier = Math.min(selectedTier, state.unlockedTier) as WorldTier;

    const activeDinos = state.activePack.map((uid) => state.dinos.find((d) => d.uid === uid)).filter((d): d is NonNullable<typeof d> => d != null);
    const reserveCount = state.dinos.length - state.activePack.length;
    const cap = reserveSize(state.packmaster.skills);

    const packPanel = el(
      'div',
      { className: 'panel camp-panel camp-pack-panel' },
      el('h2', { className: 'camp-panel-title' }, UI.activePack),
      el('div', { className: 'camp-pack-row' }, activeDinos.map((d) => dinoCard(dinoToCombatant(d), { variant: 'full' }).root)),
      el('div', { className: 'camp-reserve-note' }, `Reserve: ${reserveCount} / ${cap}`),
      el(
        'div',
        { className: 'camp-panel-actions' },
        el('button', { className: 'btn', onClick: () => ctx.replace(packScreen) }, UI.pack),
        el('button', { className: 'btn', onClick: () => ctx.replace(gearScreen) }, UI.gear),
        el('button', { className: 'btn', onClick: () => ctx.replace(skillTree) }, `${UI.skills}${state.packmaster.skillPoints > 0 ? ` (${state.packmaster.skillPoints})` : ''}`),
        el(
          'button',
          {
            className: 'btn btn-primary',
            onClick: () => {
              healAllDinos(state.dinos);
              ctx.save();
              toast('The pack is fully rested.');
              render(ctx);
            },
          },
          UI.healAll,
        ),
      ),
    );

    const xpNeeded = masterXpForLevel(state.packmaster.level);
    const xpPct = Math.min(100, Math.round((state.packmaster.xp / Math.max(1, xpNeeded)) * 100));

    const masterPanel = el(
      'div',
      { className: 'panel camp-panel camp-master-panel' },
      el('h2', { className: 'camp-panel-title' }, state.packmaster.name),
      el('div', { className: 'camp-master-level' }, `${UI.level} ${state.packmaster.level}`),
      el(
        'div',
        { className: 'camp-xp-track' },
        el('div', { className: 'camp-xp-fill', style: { width: `${xpPct}%` } }),
      ),
      el('div', { className: 'camp-xp-label' }, `${state.packmaster.xp} / ${xpNeeded} XP`),
      el(
        'div',
        { className: 'camp-essence-row' },
        svgIcon(essenceIcon(), 'camp-essence-icon'),
        el('span', null, `${state.essence} ${UI.essence}`),
      ),
    );

    const biomeCards = el(
      'div',
      { className: 'camp-biome-grid' },
      BIOME_LIST.map((biome) => {
        const clearedTier = state.apexCleared[biome.id];
        const speciesThumbs = biome.speciesPool.slice(0, 5).map((id) => {
          const species = SPECIES[id];
          return species ? svgIcon(dinoSvg({ species, stage: 'adult', seed: 1, size: 32 }), 'camp-biome-thumb') : null;
        });
        return el(
          'div',
          {
            className: `camp-biome-card${biome.id === selectedBiome ? ' camp-biome-card-selected' : ''}`,
            style: { borderColor: biome.palette.accent },
            onClick: () => {
              selectedBiome = biome.id;
              render(ctx);
            },
          },
          el('div', { className: 'camp-biome-swatch', style: { background: biome.palette.bg } }),
          el('div', { className: 'camp-biome-name' }, biome.name),
          el('div', { className: 'camp-biome-aspects' }, biome.aspectBias.map((a) => svgIcon(aspectIcon(a, biome.palette.accent, 20)))),
          el('div', { className: 'camp-biome-species' }, speciesThumbs),
          clearedTier ? el('div', { className: 'camp-biome-badge' }, `Apex cleared T${clearedTier}`) : null,
        );
      }),
    );

    const tierButtons = el(
      'div',
      { className: 'camp-tier-row' },
      WORLD_TIERS.map((tier) => {
        const locked = tier > state.unlockedTier;
        const btn = el(
          'button',
          {
            className: `btn camp-tier-btn${tier === selectedTier ? ' btn-primary' : ''}`,
            disabled: locked,
            title: locked ? `Beat an Apex boss on Tier ${tier - 1} to unlock.` : undefined,
            onClick: () => {
              selectedTier = tier;
              render(ctx);
            },
          },
          `Tier ${tier}${locked ? ' (locked)' : ''}`,
        );
        return btn;
      }),
    );

    const canStart = canFieldActivePack(activeDinos) && activeDinos.length > 0;

    const expeditionPanel = el(
      'div',
      { className: 'panel camp-panel camp-expedition-panel' },
      el('h2', { className: 'camp-panel-title' }, UI.chooseBiome),
      biomeCards,
      el('h3', { className: 'camp-panel-subtitle' }, UI.worldTier),
      tierButtons,
      el(
        'button',
        {
          className: 'btn btn-primary camp-start-btn',
          disabled: !canStart,
          title: canStart ? undefined : 'Your active pack needs at least one healthy dino.',
          onClick: () => {
            const rng = createRng(state.seed);
            const label = `expedition-${selectedBiome}-${selectedTier}-${state.stats.expeditionsCompleted}`;
            const seed = rng.fork(label).int(0, 0x7fffffff);
            state.expedition = generateExpedition({ biome: selectedBiome, tier: selectedTier, seed });
            ctx.save();
            ctx.replace(expeditionMap);
          },
        },
        UI.startExpedition,
      ),
    );

    root.replaceChildren(
      el(
        'div',
        { className: 'camp-screen' },
        el('div', { className: 'camp-hub-row' }, packPanel, masterPanel),
        expeditionPanel,
      ),
    );
  }

  return {
    mount(mountRoot: HTMLElement, ctx: GameContext): void {
      root = mountRoot;
      ctx.save();
      render(ctx);
    },
    unmount(): void {
      if (root) root.innerHTML = '';
      root = null;
    },
  };
}
