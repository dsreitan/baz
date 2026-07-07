/**
 * Item card: rarity-colored border/name (via `--rarity-*` CSS tokens),
 * slot icon, human-readable affix lines, legendary power text.
 * "Tooltip-friendly" = the full card already reads fine standalone; callers
 * that want a compact trigger can wrap `.root` with `tooltip()` from
 * `src/ui/dom.ts` and reuse `itemCardBody()` as the tooltip content.
 */
import { AFFIXES, LEGENDARY_POWERS } from '../../data/index';
import { slotIcon } from '../../render/icons';
import { el } from '../dom';
import { svgIcon } from '../svgIcon';
import type { ItemInstance, RolledAffix } from '../../core/types';

const LEGENDARY_BY_ID = Object.fromEntries(LEGENDARY_POWERS.map((p) => [p.id, p]));

function statLabel(stat: string): string {
  return stat.toUpperCase();
}

/** One human-readable line describing a rolled affix, e.g. "+4 DEF" / "+8% ATK". */
export function affixLine(rolled: RolledAffix): string {
  const def = AFFIXES[rolled.affix];
  if (!def) return rolled.affix;
  const v = Math.round(rolled.value * 10) / 10;
  switch (def.effect.kind) {
    case 'statFlat':
      return `+${v} ${statLabel(def.effect.stat)}`;
    case 'statPercent':
      return `+${v}% ${statLabel(def.effect.stat)}`;
    case 'aspectDamage':
      return `+${v}% ${statLabel(def.effect.aspect)} damage`;
    case 'onHitStatus':
      return `+${v}% chance to inflict ${def.effect.status} on hit`;
    case 'critChance':
      return `+${v}% crit chance`;
    case 'comboDamage':
      return `+${v}% combo bonus damage`;
    case 'tameChance':
      return `+${v}% tame chance`;
    case 'lootFind':
      return `+${v}% loot find`;
    case 'commandPower':
      return `+${v}% command power`;
    case 'teamStatPercent':
      return `+${v}% team ${statLabel(def.effect.stat)}`;
  }
}

/** Build the item card's inner DOM (reused by both the standalone card and tooltip content). */
export function itemCardBody(item: ItemInstance): HTMLElement {
  const legendary = item.legendaryPower ? LEGENDARY_BY_ID[item.legendaryPower] : undefined;
  return el(
    'div',
    { className: 'item-card-body' },
    el(
      'div',
      { className: 'item-card-header' },
      svgIcon(slotIcon(item.slot, `var(--rarity-${item.rarity})`, 22), 'item-card-slot-icon'),
      el(
        'div',
        { className: 'item-card-titles' },
        el('div', { className: `item-card-name item-card-name-${item.rarity}` }, item.name),
        el('div', { className: 'item-card-meta' }, `${item.rarity} · ilvl ${item.ilvl} · ${item.slot}`),
      ),
    ),
    item.affixes.length
      ? el(
          'ul',
          { className: 'item-card-affixes' },
          item.affixes.map((a) => el('li', null, affixLine(a))),
        )
      : null,
    legendary
      ? el('div', { className: 'item-card-legendary' }, el('strong', null, legendary.name), `: ${legendary.text}`)
      : null,
  );
}

export interface ItemCardHandle {
  root: HTMLElement;
}

/** Standalone item card element (border color keyed to rarity via CSS). */
export function itemCard(item: ItemInstance): ItemCardHandle {
  const root = el('div', { className: `item-card item-card-rarity-${item.rarity}` }, itemCardBody(item));
  return { root };
}
