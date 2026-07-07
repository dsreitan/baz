/**
 * MainMenu — title/tagline, 3 save slots (Continue/Export/Delete or New
 * Game for an empty slot), and whole-save Import (ARCHITECTURE §4, DESIGN
 * §9 "3 slots + export/import").
 */
import { createRng } from '../../core/rng';
import { createNewGame } from '../../core/run';
import {
  deleteSlot,
  exportSave,
  importSave,
  loadFromSlot,
  localStorageAdapter,
  saveToSlot,
  SAVE_SLOT_COUNT,
} from '../../core/save';
import type { SaveGame } from '../../core/types';
import { GAME_TAGLINE, GAME_TITLE, MOVES, SPECIES, STARTER_SPECIES, UI } from '../../data/index';
import { generateStarter } from '../../core/gen/dino';
import { camp } from './camp';
import { dinoCard } from '../components/dinoCard';
import { dinoToCombatant } from '../dinoPreview';
import { el, modal, toast, type ModalHandle } from '../dom';
import type { GameContext, Screen } from '../screenManager';

/** Deterministic small hash for starter-picker preview seeds — not persisted, just needs to be stable across re-renders. */
function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function mainMenu(): Screen {
  let root: HTMLElement | null = null;

  function renderSlot(slot: number, ctx: GameContext): HTMLElement {
    const save = loadFromSlot(localStorageAdapter, slot);

    if (!save) {
      return el(
        'div',
        { className: 'panel menu-slot menu-slot-empty' },
        el('div', { className: 'menu-slot-title' }, UI.emptySlot),
        el(
          'button',
          { className: 'btn btn-primary', onClick: () => openNewGameModal(slot, ctx) },
          UI.newGame,
        ),
      );
    }

    const { state } = save;
    const tierCount = Object.keys(state.apexCleared).length;
    return el(
      'div',
      { className: 'panel menu-slot' },
      el(
        'div',
        { className: 'menu-slot-header' },
        el('div', { className: 'menu-slot-title' }, state.packmaster.name),
        state.expedition ? el('span', { className: 'menu-slot-badge' }, 'In Expedition') : null,
      ),
      el(
        'div',
        { className: 'menu-slot-meta' },
        `${UI.level} ${state.packmaster.level} · ${state.dinos.length} dino${state.dinos.length === 1 ? '' : 's'} · Tier ${state.unlockedTier} · ${tierCount} apex${tierCount === 1 ? '' : 'es'} cleared`,
      ),
      el('div', { className: 'menu-slot-saved-at' }, `Saved ${formatSavedAt(save.savedAt)}`),
      el(
        'div',
        { className: 'menu-slot-actions' },
        el(
          'button',
          {
            className: 'btn btn-primary',
            onClick: () => {
              Object.assign(ctx.state, state);
              ctx.activeSlot.value = slot;
              ctx.goto(camp);
            },
          },
          UI.continueGame,
        ),
        el('button', { className: 'btn', onClick: () => openExportModal(save) }, UI.exportSave),
        el(
          'button',
          { className: 'btn', onClick: () => confirmDelete(slot, ctx) },
          'Delete',
        ),
      ),
    );
  }

  function confirmDelete(slot: number, ctx: GameContext): void {
    const handle: ModalHandle = modal({
      title: 'Delete save?',
      content: 'This cannot be undone.',
      actions: [
        { label: UI.cancel, onClick: () => handle.close() },
        {
          label: 'Delete',
          primary: true,
          onClick: () => {
            deleteSlot(localStorageAdapter, slot);
            handle.close();
            ctx.replace(mainMenu);
          },
        },
      ],
    });
  }

  function openExportModal(save: SaveGame): void {
    const encoded = exportSave(save);
    const textarea = el('textarea', { className: 'menu-export-textarea', readonly: true, rows: 8 }, encoded) as HTMLTextAreaElement;
    const handle: ModalHandle = modal({
      title: UI.exportSave,
      content: el(
        'div',
        null,
        'Copy this text to share or back up your save.',
        textarea,
      ),
      actions: [
        {
          label: 'Copy',
          onClick: () => {
            textarea.select();
            void navigator.clipboard?.writeText(encoded).catch(() => {});
            toast('Copied to clipboard.');
          },
        },
        { label: UI.close, primary: true, onClick: () => handle.close() },
      ],
    });
    textarea.focus();
    textarea.select();
  }

  function openImportModal(ctx: GameContext): void {
    let targetSlot = 0;
    const textarea = el('textarea', { className: 'menu-export-textarea', rows: 8, placeholder: 'Paste an exported save here…' }) as HTMLTextAreaElement;
    const slotPicker = el(
      'div',
      { className: 'menu-import-slot-picker' },
      Array.from({ length: SAVE_SLOT_COUNT }, (_, i) =>
        el(
          'button',
          {
            className: `btn${i === targetSlot ? ' btn-primary' : ''}`,
            onClick: (e: MouseEvent) => {
              targetSlot = i;
              const buttons = (e.currentTarget as HTMLElement).parentElement?.querySelectorAll('button') ?? [];
              buttons.forEach((b, idx) => b.classList.toggle('btn-primary', idx === i));
            },
          },
          `Slot ${i + 1}`,
        ),
      ),
    );
    const handle: ModalHandle = modal({
      title: UI.importSave,
      content: el('div', null, 'Choose a slot to overwrite, then paste the exported text:', slotPicker, textarea),
      actions: [
        { label: UI.cancel, onClick: () => handle.close() },
        {
          label: UI.importSave,
          primary: true,
          onClick: () => {
            const parsed = importSave(textarea.value.trim());
            if (!parsed) {
              toast('That save text could not be read.');
              return;
            }
            saveToSlot(localStorageAdapter, targetSlot, parsed.state, parsed.savedAt);
            handle.close();
            toast('Save imported.');
            ctx.replace(mainMenu);
          },
        },
      ],
    });
  }

  function openNewGameModal(slot: number, ctx: GameContext): void {
    let name = 'Packmaster';
    let chosen: (typeof STARTER_SPECIES)[number] = STARTER_SPECIES[0]!;

    const nameInput = el('input', {
      className: 'menu-name-input',
      type: 'text',
      value: name,
      placeholder: 'Packmaster',
      maxlength: 24,
      onInput: (e: Event) => {
        name = (e.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    const starterCards = el('div', { className: 'menu-starter-grid' });

    function renderStarters(): void {
      starterCards.replaceChildren(
        ...STARTER_SPECIES.map((id) => {
          const species = SPECIES[id];
          if (!species) return null;
          const previewRng = createRng(seedFromString(id));
          const preview = generateStarter(id, previewRng);
          const combatant = dinoToCombatant(preview);
          const card = dinoCard(combatant, { variant: 'full', selected: id === chosen, onClick: () => { chosen = id; renderStarters(); } });
          const moveNames = preview.moves.map((m) => MOVES[m]?.name ?? m).join(', ');
          return el(
            'div',
            { className: 'menu-starter-cell' },
            card.root,
            el('div', { className: 'menu-starter-flavor' }, species.flavor),
            el('div', { className: 'menu-starter-moves' }, `Starting moves: ${moveNames}`),
          );
        }).filter((cell): cell is HTMLDivElement => cell != null),
      );
    }
    renderStarters();

    const handle: ModalHandle = modal({
      title: UI.chooseStarter,
      content: el(
        'div',
        { className: 'menu-new-game' },
        el('label', { className: 'menu-name-label' }, 'Packmaster name', nameInput),
        starterCards,
      ),
      actions: [
        { label: UI.cancel, onClick: () => handle.close() },
        {
          label: UI.newGame,
          primary: true,
          onClick: () => {
            const state = createNewGame({ name, starterSpecies: chosen, seed: Date.now() >>> 0 });
            Object.assign(ctx.state, state);
            ctx.activeSlot.value = slot;
            ctx.save();
            handle.close();
            ctx.goto(camp);
          },
        },
      ],
    });
  }

  return {
    mount(mountRoot: HTMLElement, ctx: GameContext): void {
      root = mountRoot;
      const slots = el(
        'div',
        { className: 'menu-slots' },
        Array.from({ length: SAVE_SLOT_COUNT }, (_, i) => renderSlot(i, ctx)),
      );
      root.appendChild(
        el(
          'div',
          { className: 'main-menu' },
          el('h1', { className: 'main-menu-title' }, GAME_TITLE),
          el('p', { className: 'main-menu-subtitle' }, GAME_TAGLINE),
          slots,
          el('button', { className: 'btn menu-import-btn', onClick: () => openImportModal(ctx) }, UI.importSave),
        ),
      );
    },
    unmount(): void {
      if (root) root.innerHTML = '';
      root = null;
    },
  };
}
