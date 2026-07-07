/**
 * Dino card: portrait SVG, name, level, aspect+role icons, HP bar, trait
 * tooltip. `compact` is a small battle-row tile (portrait + name + HP);
 * `full` adds the aspect/role icon row and a trait tooltip badge — used for
 * reserve pickers / pack screens.
 */
import { SPECIES, TRAITS } from '../../data/index';
import { aspectIcon, roleIcon } from '../../render/icons';
import { dinoSvg } from '../../render/dinoSvg';
import { el, tooltip } from '../dom';
import { svgIcon } from '../svgIcon';
import { healthBar } from './healthBar';
import type { Combatant } from '../../core/types';

export type DinoCardVariant = 'compact' | 'full';

export interface DinoCardOptions {
  variant?: DinoCardVariant;
  facing?: 'left' | 'right';
  onClick?: () => void;
  selected?: boolean;
}

export interface DinoCardHandle {
  root: HTMLElement;
  update(combatant: Combatant): void;
}

export function dinoCard(combatant: Combatant, opts: DinoCardOptions = {}): DinoCardHandle {
  const variant = opts.variant ?? 'compact';
  const species = SPECIES[combatant.species];
  const portraitSize = variant === 'full' ? 140 : 88;

  const portrait = el(
    'div',
    { className: 'dino-card-portrait' },
    species
      ? svgIcon(dinoSvg({ species, stage: combatant.stage, seed: combatant.appearanceSeed, facing: opts.facing ?? 'right', size: portraitSize }))
      : null,
  );

  const nameRow = el(
    'div',
    { className: 'dino-card-name-row' },
    el('span', { className: 'dino-card-name' }, combatant.nickname),
    el('span', { className: 'dino-card-level' }, `Lv.${combatant.level}`),
  );

  let badgeRow: HTMLElement | null = null;
  if (variant === 'full' && species) {
    badgeRow = el(
      'div',
      { className: 'dino-card-badges' },
      svgIcon(aspectIcon(species.aspect, `var(--aspect-${species.aspect}-base)`, 20), 'dino-card-badge'),
      svgIcon(roleIcon(species.role, 'var(--color-text)', 20), 'dino-card-badge'),
    );
    const trait = TRAITS[combatant.trait];
    if (trait) {
      const traitBadge = el('span', { className: 'dino-card-trait-badge' }, trait.name);
      tooltip(traitBadge, trait.description);
      badgeRow.appendChild(traitBadge);
    }
  }

  const hp = healthBar(combatant);

  const root = el(
    'div',
    {
      className: `dino-card dino-card-${variant}${opts.selected ? ' dino-card-selected' : ''}${combatant.fainted ? ' dino-card-fainted' : ''}`,
      dataset: { uid: combatant.uid },
      onClick: opts.onClick,
    },
    portrait,
    nameRow,
    badgeRow,
    hp.root,
  );

  function update(c: Combatant): void {
    root.classList.toggle('dino-card-fainted', c.fainted);
    hp.update(c);
  }

  return { root, update };
}
