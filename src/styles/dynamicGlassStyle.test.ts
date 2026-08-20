import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const styles = readFileSync('src/styles/global.css', 'utf8');

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('uses a two-layer outline-free diffuse highlight', () => {
  const base = ruleBody('.dynamic-glass-light');
  const navigation = ruleBody('.dynamic-control-surface[data-material="navigation"] .dynamic-glass-light');

  expect(base.match(/radial-gradient\(circle/g)).toHaveLength(2);
  expect(base).toContain('filter: blur(14px)');
  expect(base).toContain('inset: 0');
  expect(navigation).toContain('opacity: calc(var(--glass-active) * .2)');
});

test('does not draw surface-specific ellipse spotlights', () => {
  expect(ruleBody('.sidebar .dynamic-glass-light')).not.toContain('ellipse');
  expect(ruleBody('.toolbar .dynamic-glass-light')).not.toContain('ellipse');
});

test('keeps the pointer highlight hidden for reduced motion', () => {
  expect(styles).toMatch(/prefers-reduced-motion:[\s\S]*?dynamic-glass-light[^}]*opacity:\s*0\s*!important/);
});

test('defines a theme-aware immersive cursor with an accessibility fallback', () => {
  expect(ruleBody('.immersive-cursor')).toContain('position: fixed');
  expect(styles).toMatch(/prefers-color-scheme: dark[\s\S]*--cursor-halo/);
  expect(styles).toMatch(/prefers-reduced-motion[\s\S]*?\.immersive-cursor[^}]*display:\s*none/);
  expect(styles).toMatch(/has-immersive-cursor[\s\S]*?input[^}]*cursor:\s*text/);
});
