/**
 * Small hand-rolled DOM helpers. UI-only module (no purity constraints —
 * unlike `src/core`, DOM access is exactly the point here).
 */

export type ElChild = Node | string | number | null | undefined | false | ElChild[];

/**
 * Attribute bag for `el()`. Special-cased keys:
 * - `className` sets the class attribute.
 * - `style` merges into `element.style` (object form only).
 * - `dataset` merges into `element.dataset`.
 * - `on<Event>` (e.g. `onClick`) attaches an event listener.
 * - boolean values toggle the attribute's presence.
 * - anything else is set via `setAttribute(key, String(value))`.
 */
export type ElAttrs = Record<string, unknown>;

function appendChild(node: Node, child: ElChild): void {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) appendChild(node, c);
    return;
  }
  if (typeof child === 'string' || typeof child === 'number') {
    node.appendChild(document.createTextNode(String(child)));
    return;
  }
  node.appendChild(child);
}

/** Create an element, apply attrs, and append children. Text/nodes/arrays/falsy all accepted as children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElAttrs | null,
  ...children: ElChild[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) continue;
      if (key === 'className') {
        node.className = String(value);
      } else if (key === 'style' && typeof value === 'object' && value !== null) {
        Object.assign(node.style, value as Partial<CSSStyleDeclaration>);
      } else if (key === 'dataset' && typeof value === 'object' && value !== null) {
        Object.assign(node.dataset, value as Record<string, string>);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (typeof value === 'boolean') {
        if (value) node.setAttribute(key, '');
        else node.removeAttribute(key);
      } else if (value !== null) {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) appendChild(node, child);
  return node;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export interface ModalAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface ModalOptions {
  title?: string;
  content: ElChild;
  actions?: ModalAction[];
  onClose?: () => void;
}

export interface ModalHandle {
  close: () => void;
}

/** Open a centered modal dialog above an overlay. Click outside or an action closes it. */
export function modal(options: ModalOptions): ModalHandle {
  const actions = options.actions ?? [];

  const box = el(
    'div',
    { className: 'modal' },
    options.title ? el('h2', { className: 'modal-title' }, options.title) : null,
    el('div', { className: 'modal-content' }, options.content),
    actions.length
      ? el(
          'div',
          { className: 'modal-actions' },
          actions.map((action) =>
            el(
              'button',
              {
                className: action.primary ? 'btn btn-primary' : 'btn',
                onClick: () => action.onClick(),
              },
              action.label,
            ),
          ),
        )
      : null,
  );

  const overlay = el('div', { className: 'modal-overlay' }, box);

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  function close(): void {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    options.onClose?.();
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeydown);

  document.body.appendChild(overlay);
  return { close };
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = el('div', { className: 'toast-container' });
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/** Show a transient, auto-dismissing toast notification. */
export function toast(message: string, durationMs = 2800): void {
  const container = getToastContainer();
  const node = el('div', { className: 'toast' }, message);
  container.appendChild(node);

  // Force a layout flush so the transition below actually animates in.
  requestAnimationFrame(() => node.classList.add('toast-visible'));

  setTimeout(() => {
    node.classList.remove('toast-visible');
    setTimeout(() => node.remove(), 250);
  }, durationMs);
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

/** Attach a hover/focus tooltip to `target`. Returns a detach function. */
export function tooltip(target: HTMLElement, text: string | (() => string)): () => void {
  let tooltipEl: HTMLElement | null = null;

  function show(): void {
    const content = typeof text === 'function' ? text() : text;
    tooltipEl = el('div', { className: 'tooltip' }, content);
    document.body.appendChild(tooltipEl);
    const rect = target.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    tooltipEl.style.left = `${rect.left + rect.width / 2 - tipRect.width / 2}px`;
    tooltipEl.style.top = `${rect.top - tipRect.height - 8}px`;
  }

  function hide(): void {
    tooltipEl?.remove();
    tooltipEl = null;
  }

  target.addEventListener('mouseenter', show);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('focus', show);
  target.addEventListener('blur', hide);

  return () => {
    hide();
    target.removeEventListener('mouseenter', show);
    target.removeEventListener('mouseleave', hide);
    target.removeEventListener('focus', show);
    target.removeEventListener('blur', hide);
  };
}
