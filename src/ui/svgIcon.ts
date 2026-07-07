/**
 * Tiny DOM helper for dropping a `src/render/icons.ts` / `dinoSvg.ts` SVG
 * string into the tree. Kept separate from `dom.ts` (an existing file we
 * don't touch this phase) since `el()`'s attrs bag intentionally doesn't
 * special-case `innerHTML`.
 */
export function svgIcon(svgMarkup: string, className?: string): HTMLElement {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.innerHTML = svgMarkup;
  return span;
}
