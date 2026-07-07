/**
 * Pack screen — roster management (DESIGN §4.4/§4.5, ARCHITECTURE §4):
 * active trio (1-3) vs reserve (respecting Handler `reserveSize` skills),
 * move-slot editing (4 active slots from the species learnset), nickname
 * editing, and release-for-essence.
 */
import { xpForLevel } from '../../core/progression';
import { releaseEssence } from '../../core/gen/loot';
import { applyEssenceYieldBonus, reserveSize } from '../../core/run';
import type { DinoInstance, Uid } from '../../core/types';
import { UI } from '../../data/index';
import { dinoCard } from '../components/dinoCard';
import { dinoToCombatant } from '../dinoPreview';
import { el, modal, toast, type ModalHandle } from '../dom';
import { openMovesModal } from '../moveTutor';
import type { GameContext, Screen } from '../screenManager';
import { camp } from './camp';

function xpBar(dino: DinoInstance): HTMLElement {
  const needed = dino.level >= 30 ? dino.xp || 1 : xpForLevel(dino.level);
  const pct = Math.min(100, Math.round((dino.xp / Math.max(1, needed)) * 100));
  return el(
    'div',
    { className: 'pack-xp-wrap' },
    el('div', { className: 'pack-xp-track' }, el('div', { className: 'pack-xp-fill', style: { width: `${pct}%` } })),
    el('div', { className: 'pack-xp-label' }, dino.level >= 30 ? 'Max level' : `${dino.xp} / ${needed} XP`),
  );
}

export function packScreen(): Screen {
  let root: HTMLElement | null = null;

  function openRenameModal(dino: DinoInstance, ctx: GameContext, rerender: () => void): void {
    const input = el('input', { className: 'menu-name-input', type: 'text', value: dino.nickname, maxlength: 20 }) as HTMLInputElement;
    const handle: ModalHandle = modal({
      title: 'Rename',
      content: el('div', null, input),
      actions: [
        { label: UI.cancel, onClick: () => handle.close() },
        {
          label: UI.confirm,
          primary: true,
          onClick: () => {
            const trimmed = input.value.trim();
            if (trimmed.length > 0) dino.nickname = trimmed;
            ctx.save();
            handle.close();
            rerender();
          },
        },
      ],
    });
    input.focus();
    input.select();
  }

  function confirmRelease(dino: DinoInstance, ctx: GameContext, rerender: () => void): void {
    const handle: ModalHandle = modal({
      title: `Release ${dino.nickname}?`,
      content: `This frees up a reserve slot and grants essence. This cannot be undone.`,
      actions: [
        { label: UI.cancel, onClick: () => handle.close() },
        {
          label: UI.release,
          primary: true,
          onClick: () => {
            const gained = applyEssenceYieldBonus(releaseEssence(dino), ctx.state.packmaster.skills);
            ctx.state.essence += gained;
            ctx.state.dinos = ctx.state.dinos.filter((d) => d.uid !== dino.uid);
            ctx.state.activePack = ctx.state.activePack.filter((uid) => uid !== dino.uid);
            ctx.save();
            toast(`${dino.nickname} released — +${gained} essence.`);
            handle.close();
            rerender();
          },
        },
      ],
    });
  }

  function buildDinoTile(dino: DinoInstance, isActive: boolean, ctx: GameContext, rerender: () => void): HTMLElement {
    const card = dinoCard(dinoToCombatant(dino), { variant: 'full' });
    const canBench = ctx.state.activePack.length > 1;
    const canActivate = ctx.state.activePack.length < 3;

    const swapBtn = isActive
      ? el(
          'button',
          {
            className: 'btn',
            disabled: !canBench,
            title: canBench ? undefined : 'At least one dino must stay active.',
            onClick: () => {
              ctx.state.activePack = ctx.state.activePack.filter((uid) => uid !== dino.uid);
              ctx.save();
              rerender();
            },
          },
          'Bench',
        )
      : el(
          'button',
          {
            className: 'btn',
            disabled: !canActivate,
            title: canActivate ? undefined : 'Active pack is full (3) — bench one first.',
            onClick: () => {
              ctx.state.activePack = [...ctx.state.activePack, dino.uid];
              ctx.save();
              rerender();
            },
          },
          'Activate',
        );

    return el(
      'div',
      { className: 'panel pack-tile' },
      card.root,
      xpBar(dino),
      el('div', { className: 'pack-tile-trait' }, `Quirk: +${dino.quirk.percent}% ${dino.quirk.stat.toUpperCase()}`),
      el(
        'div',
        { className: 'pack-tile-actions' },
        swapBtn,
        el('button', { className: 'btn', onClick: () => openMovesModal(dino, ctx, rerender) }, UI.moves),
        el('button', { className: 'btn', onClick: () => openRenameModal(dino, ctx, rerender) }, 'Rename'),
        !isActive ? el('button', { className: 'btn', onClick: () => confirmRelease(dino, ctx, rerender) }, UI.release) : null,
      ),
    );
  }

  function render(ctx: GameContext): void {
    if (!root) return;
    const state = ctx.state;
    const activeUids = new Set<Uid>(state.activePack);
    const active = state.dinos.filter((d) => activeUids.has(d.uid));
    const reserve = state.dinos.filter((d) => !activeUids.has(d.uid));
    const cap = reserveSize(state.packmaster.skills);

    const rerender = () => render(ctx);

    root.replaceChildren(
      el(
        'div',
        { className: 'pack-screen' },
        el('div', { className: 'pack-screen-header' }, el('h1', null, UI.pack), el('button', { className: 'btn', onClick: () => ctx.replace(camp) }, UI.back)),
        el('h2', { className: 'pack-section-title' }, `${UI.activePack} (${active.length}/3)`),
        el('div', { className: 'pack-grid' }, active.map((d) => buildDinoTile(d, true, ctx, rerender))),
        el('h2', { className: 'pack-section-title' }, `${UI.reserve} (${reserve.length}/${cap})`),
        el('div', { className: 'pack-grid' }, reserve.map((d) => buildDinoTile(d, false, ctx, rerender))),
      ),
    );
  }

  return {
    mount(mountRoot: HTMLElement, ctx: GameContext): void {
      root = mountRoot;
      render(ctx);
    },
    unmount(): void {
      if (root) root.innerHTML = '';
      root = null;
    },
  };
}
