export type CursorMode = 'default' | 'control' | 'native';

const nativeSelector = 'textarea, select, [contenteditable="true"], [role="textbox"], input:not([type]), input[type="text"], input[type="email"], input[type="number"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"], input[type="date"], input[type="time"]';
const controlSelector = 'button, a[href], summary, [role="button"], [role="link"], label[for], input[type="checkbox"], input[type="radio"], input[type="range"]';

export function cursorModeForTarget(target: EventTarget | null): CursorMode {
  if (!(target instanceof Element)) return 'default';
  if (target.closest(nativeSelector)) return 'native';
  return target.closest(controlSelector) ? 'control' : 'default';
}
