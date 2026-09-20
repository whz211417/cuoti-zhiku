import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const styles = readFileSync('src/styles/global.css', 'utf8');

test('uses the native pointer without a global glow layer', () => {
  expect(styles).not.toContain('has-immersive-cursor');
  expect(styles).not.toContain('.immersive-cursor');
  expect(styles).not.toContain('--cursor-halo');
  expect(styles).not.toContain('cursor: none !important');
});

test('keeps navigation material static instead of tracking pointer coordinates', () => {
  expect(styles).not.toContain('.dynamic-glass-light');
  expect(styles).not.toContain('--glass-local-x');
  expect(styles).not.toContain('--glass-local-y');
  expect(styles).not.toContain('--glass-active');
});

test('limits frequent control feedback to composited properties', () => {
  expect(styles).not.toMatch(/transition\s*:\s*all/);
  expect(styles).toMatch(/\.toolbar-button:active[^}]*transform:\s*scale\(\.98\)/);
});
