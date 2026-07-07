/**
 * Animated HP bar: fill transitions via CSS (width changes trigger the
 * `.health-bar-fill` transition in `src/styles/battle.css`), a shield
 * overlay segment, and a status-chip row with turns-left badges. Reads
 * straight off a `Combatant` (works for both player and enemy sides).
 */
import { statusIcon, statusLabel } from '../../render/icons';
import { el, tooltip } from '../dom';
import { svgIcon } from '../svgIcon';
import type { Combatant } from '../../core/types';

export interface HealthBarHandle {
  root: HTMLElement;
  update(combatant: Combatant): void;
}

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function healthBar(combatant: Combatant): HealthBarHandle {
  const fill = el('div', { className: 'health-bar-fill' });
  const shieldOverlay = el('div', { className: 'health-bar-shield' });
  const numbers = el('div', { className: 'health-bar-numbers' });
  const track = el('div', { className: 'health-bar-track' }, fill, shieldOverlay);
  const statusRow = el('div', { className: 'status-chip-row' });
  const root = el('div', { className: 'health-bar' }, track, numbers, statusRow);

  function render(c: Combatant): void {
    const maxHp = c.stats.hp;
    fill.style.width = `${pct(c.currentHp, maxHp)}%`;
    fill.classList.toggle('health-bar-fill-low', c.currentHp / Math.max(1, maxHp) < 0.3);
    shieldOverlay.style.width = `${pct(c.shield, maxHp)}%`;
    shieldOverlay.style.display = c.shield > 0 ? '' : 'none';
    numbers.textContent = `${Math.max(0, Math.round(c.currentHp))} / ${maxHp}${c.shield > 0 ? ` (+${c.shield})` : ''}`;

    statusRow.replaceChildren(
      ...c.statuses.map((status) => {
        const chip = el(
          'span',
          { className: `status-chip status-chip-${status.id}` },
          svgIcon(statusIcon(status.id), 'status-chip-icon'),
          el('span', { className: 'status-chip-turns' }, String(status.turnsLeft)),
        );
        tooltip(chip, `${statusLabel(status.id)} (${status.turnsLeft} turn${status.turnsLeft === 1 ? '' : 's'} left)`);
        return chip;
      }),
    );

    root.classList.toggle('dino-fainted', c.fainted);
  }

  render(combatant);
  return { root, update: render };
}
