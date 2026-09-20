import { describe, expect, it } from 'vitest';
import { shouldRunAutomaticCheck } from './updatePolicy';

describe('shouldRunAutomaticCheck', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');

  it('checks when there is no prior successful check', () => {
    expect(shouldRunAutomaticCheck(null, now)).toBe(true);
  });

  it('waits until a full 24 hours have elapsed', () => {
    expect(shouldRunAutomaticCheck('2026-09-19T12:01:00.000Z', now)).toBe(false);
    expect(shouldRunAutomaticCheck('2026-09-19T12:00:00.000Z', now)).toBe(true);
  });

  it('recovers from invalid or future timestamps', () => {
    expect(shouldRunAutomaticCheck('not-a-date', now)).toBe(true);
    expect(shouldRunAutomaticCheck('2026-09-21T12:00:00.000Z', now)).toBe(true);
  });
});
