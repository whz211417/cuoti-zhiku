import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const styles = readFileSync('src/styles/global.css', 'utf8');

test('bounds long inspectors to the dynamic viewport and gives the dialog one scroll owner', () => {
  expect(styles).toMatch(/\.inspector-glass\s*\{[^}]*max-height:\s*calc\(100dvh - 32px\)/s);
  expect(styles).toMatch(/\.inspector-surface\s*\{[^}]*min-width:\s*0/s);
  expect(styles).toMatch(/\.preferences-inspector,\s*\.ai-review-inspector\s*\{[^}]*max-height:\s*calc\(100dvh - 32px\)[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s);
});

test('keeps dismissal reachable and stacks wide controls in narrow windows', () => {
  expect(styles).toMatch(/\.preferences-inspector,\s*\.ai-review-inspector\s*\{[^}]*--inspector-padding:\s*20px/s);
  expect(styles).toMatch(/\.preferences-inspector\s*>\s*\.preferences-header,\s*\.ai-review-inspector\s*>\s*\.preferences-header\s*\{[^}]*position:\s*sticky[^}]*top:\s*calc\(-1 \* var\(--inspector-padding\)\)[^}]*margin:\s*calc\(-1 \* var\(--inspector-padding\)\)[^}]*background:\s*var\(--paper\)/s);
  expect(styles).toMatch(/\.inspector-glass\s*>\s*svg\s*\{[^}]*z-index:\s*0[^}]*pointer-events:\s*none/s);
  expect(styles).toMatch(/\.inspector-glass\s*>\s*\.glass\s*\{[^}]*z-index:\s*1/s);
  expect(styles).toMatch(/@media\s*\(max-width:\s*650px\)\s*\{[\s\S]*?\.preference-row\s*\{[^}]*flex-direction:\s*column/s);
  expect(styles).toMatch(/@media\s*\(max-width:\s*650px\)\s*\{[\s\S]*?\.ai-mode-picker\s*\{[^}]*grid-template-columns:\s*1fr/s);
  expect(styles).toMatch(/@media\s*\(max-width:\s*650px\)\s*\{[\s\S]*?\.ai-material-consent\s*>\s*div\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
