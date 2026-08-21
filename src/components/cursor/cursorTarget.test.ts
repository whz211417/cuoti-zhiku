import { expect, test } from 'vitest';
import { cursorModeForTarget } from './cursorTarget';

test('uses the compact control cursor for clickable controls', () => {
  const button = document.createElement('button');
  expect(cursorModeForTarget(button)).toBe('control');
});

test('keeps the native cursor for editable controls', () => {
  const input = document.createElement('input');
  expect(cursorModeForTarget(input)).toBe('native');
});

test('treats checkbox inputs as clickable controls rather than text input', () => {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  expect(cursorModeForTarget(checkbox)).toBe('control');
});

test('uses the standard immersive pointer for ordinary content', () => {
  const content = document.createElement('p');
  expect(cursorModeForTarget(content)).toBe('default');
});
