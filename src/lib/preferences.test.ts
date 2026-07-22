import { afterEach, expect, test, vi } from 'vitest';
import { getMotionPreferences } from './preferences';

afterEach(() => vi.unstubAllGlobals());

test('reads accessibility media preferences when matchMedia is available', () => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() })));

  expect(getMotionPreferences()).toEqual({ reduceMotion: true, reduceTransparency: true });
});

test('uses safe defaults when matchMedia is unavailable', () => {
  vi.stubGlobal('matchMedia', undefined);

  expect(getMotionPreferences()).toEqual({ reduceMotion: false, reduceTransparency: false });
});
