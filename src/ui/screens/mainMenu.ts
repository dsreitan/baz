/**
 * Placeholder MainMenu screen — Phase 1 only proves the screen manager
 * works end to end. Real save-slot picking, starter choice, and
 * export/import land in Phase 6; title text moves to `data/strings.ts`
 * once Phase 2 exists.
 */
import { el, toast } from '../dom';
import type { GameContext, Screen } from '../screenManager';

/** Placeholder title — Phase 2 introduces `src/data/strings.ts` as the real source. */
const PLACEHOLDER_TITLE = 'Clawbound';

export function mainMenu(): Screen {
  let root: HTMLElement | null = null;

  return {
    mount(mountRoot: HTMLElement, _ctx: GameContext): void {
      root = mountRoot;
      root.appendChild(
        el(
          'div',
          { className: 'main-menu' },
          el('h1', { className: 'main-menu-title' }, PLACEHOLDER_TITLE),
          el('p', { className: 'main-menu-subtitle' }, 'Phase 1 scaffold — screen manager online.'),
          el(
            'button',
            {
              className: 'btn btn-primary',
              onClick: () => toast('New Game is not implemented yet — coming in Phase 6.'),
            },
            'New Game',
          ),
        ),
      );
    },
    unmount(): void {
      if (root) root.innerHTML = '';
      root = null;
    },
  };
}
