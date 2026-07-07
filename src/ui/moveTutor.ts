/**
 * Shared "manage a dino's 4 active move slots from its learnset-so-far"
 * modal — used by the Pack screen (any time) and the Grove node's optional
 * move tutor (DESIGN §7). Kept here once rather than duplicated.
 */
import type { DinoInstance, MoveId } from '../core/types';
import { MOVES, SPECIES } from '../data/index';
import { el, modal, type ModalHandle } from './dom';
import type { GameContext } from './screenManager';

export function openMovesModal(dino: DinoInstance, ctx: GameContext, onChange: () => void): void {
  const species = SPECIES[dino.species];
  if (!species) return;
  const learned = species.learnset.filter((e) => e.level <= dino.level).map((e) => e.move);

  let handle: ModalHandle | undefined;
  function content(): HTMLElement {
    const equippedRow = el(
      'div',
      { className: 'pack-moves-equipped' },
      dino.moves.map((moveId) =>
        el(
          'div',
          { className: 'pack-move-chip pack-move-chip-equipped' },
          el('span', null, MOVES[moveId]?.name ?? moveId),
          dino.moves.length > 1
            ? el(
                'button',
                {
                  className: 'btn pack-move-remove',
                  onClick: () => {
                    dino.moves = dino.moves.filter((m) => m !== moveId);
                    ctx.save();
                    refresh();
                  },
                },
                '×',
              )
            : null,
        ),
      ),
    );
    const availableRow = el(
      'div',
      { className: 'pack-moves-available' },
      learned
        .filter((m) => !dino.moves.includes(m))
        .map((moveId) =>
          el(
            'button',
            {
              className: 'btn pack-move-chip',
              disabled: dino.moves.length >= 4,
              onClick: () => {
                dino.moves = [...dino.moves, moveId as MoveId];
                ctx.save();
                refresh();
              },
            },
            MOVES[moveId]?.name ?? moveId,
          ),
        ),
    );
    return el(
      'div',
      { className: 'pack-moves-modal' },
      el('h3', null, 'Active moves (4 max)'),
      equippedRow,
      el('h3', null, 'Learned moves'),
      dino.moves.length >= 4 ? el('p', { className: 'pack-moves-hint' }, 'Remove a move above to learn a new one.') : null,
      availableRow,
    );
  }
  function refresh(): void {
    handle?.close();
    handle = modal({
      title: `${dino.nickname}'s Moves`,
      content: content(),
      actions: [{ label: 'Close', primary: true, onClick: () => { handle?.close(); onChange(); } }],
    });
  }
  refresh();
}
