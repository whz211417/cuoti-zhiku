import { expect, test } from 'vitest';
import { localCalendarDate, timeGreeting } from './dates';

test('uses the China calendar day during early morning when UTC is still the previous day', () => {
  const chinaEarlyMorning = new Date('2026-07-30T16:30:00.000Z');

  expect(localCalendarDate(chinaEarlyMorning, 'Asia/Shanghai')).toBe('2026-07-31');
});

test.each([
  [8, '早上好'],
  [12, '中午好'],
  [15, '下午好'],
  [20, '晚上好'],
])('returns a readable greeting for hour %i', (hour, greeting) => {
  expect(timeGreeting(new Date(2026, 6, 31, hour))).toBe(greeting);
});
