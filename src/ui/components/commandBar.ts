/**
 * Packmaster command bar: one command per round, doesn't consume the acting
 * dino's turn (ARCHITECTURE §5). Buttons show name + description via
 * tooltip and disable themselves once `commandUsedThisRound` is true.
 * Target selection (heal one dino / reset one dino's cooldowns / free swap)
 * is the caller's job — `onSelect` just reports which command was picked.
 */
import { COMMANDS } from '../../data/index';
import { el, tooltip } from '../dom';
import type { CommandId } from '../../core/types';

export interface CommandBarOptions {
  commands: CommandId[];
  disabled: boolean;
  onSelect: (command: CommandId) => void;
}

export interface CommandBarHandle {
  root: HTMLElement;
  setDisabled(disabled: boolean): void;
}

export function commandBar(opts: CommandBarOptions): CommandBarHandle {
  const buttons: HTMLButtonElement[] = [];

  const root = el(
    'div',
    { className: 'command-bar' },
    opts.commands.map((commandId) => {
      const def = COMMANDS[commandId];
      const label = def?.name ?? commandId;
      const btn = el(
        'button',
        {
          className: 'btn command-bar-btn',
          disabled: opts.disabled,
          onClick: () => opts.onSelect(commandId),
        },
        label,
      );
      if (def) tooltip(btn, def.description);
      buttons.push(btn);
      return btn;
    }),
  );

  function setDisabled(disabled: boolean): void {
    for (const btn of buttons) btn.disabled = disabled;
  }

  return { root, setDisabled };
}
