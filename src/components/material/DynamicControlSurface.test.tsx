import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const motionPreferences = vi.hoisted(() => ({
  reduceMotion: false,
  reduceTransparency: false,
}));

vi.mock('../../lib/preferences', () => ({
  getMotionPreferences: () => motionPreferences,
}));

import { DynamicControlSurface } from './DynamicControlSurface';
import { normalizedPointerPosition } from './dynamicControlMath';

afterEach(() => {
  motionPreferences.reduceMotion = false;
  motionPreferences.reduceTransparency = false;
  vi.restoreAllMocks();
});

test('normalizes and clamps the pointer position inside a surface', () => {
  const rect = { left: 20, top: 10, width: 200, height: 100 };

  expect(normalizedPointerPosition(rect, 120, 60)).toEqual({ x: 50, y: 50 });
  expect(normalizedPointerPosition(rect, -50, 500)).toEqual({ x: 0, y: 100 });
});

test('updates material coordinates outside the React render cycle', () => {
  let pendingFrame: FrameRequestCallback | undefined;
  const requestFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    pendingFrame = callback;
    return 1;
  });

  render(
    <DynamicControlSurface aria-label="动态工具栏" as="header">
      <span>工具</span>
    </DynamicControlSurface>,
  );

  const surface = screen.getByLabelText('动态工具栏');
  const rectSpy = vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    bottom: 100,
    height: 100,
    left: 0,
    right: 200,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  fireEvent(surface, new MouseEvent('pointermove', { bubbles: true, clientX: 150, clientY: 25 }));
  fireEvent(surface, new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 50 }));
  pendingFrame?.(0);

  expect(surface.style.getPropertyValue('--glass-x')).toBe('50%');
  expect(surface.style.getPropertyValue('--glass-y')).toBe('50%');
  expect(surface.style.getPropertyValue('--glass-shift-x')).toBe('0px');
  expect(surface.style.getPropertyValue('--glass-shift-y')).toBe('0px');
  expect(surface.style.getPropertyValue('--glass-active')).toBe('1');
  expect(requestFrameSpy).toHaveBeenCalledTimes(1);
  expect(rectSpy).toHaveBeenCalledTimes(1);
  expect(surface.querySelector('.dynamic-glass-light')).toBeInTheDocument();

  fireEvent.pointerLeave(surface);
  expect(surface.style.getPropertyValue('--glass-active')).toBe('0');
  expect(surface.style.getPropertyValue('--glass-y')).toBe('0%');
});

test('uses a static surface when motion or transparency is reduced', () => {
  motionPreferences.reduceTransparency = true;

  render(<DynamicControlSurface aria-label="静态工具栏" as="header">工具</DynamicControlSurface>);

  const surface = screen.getByLabelText('静态工具栏');
  fireEvent.pointerMove(surface, { clientX: 80, clientY: 20 });

  expect(surface).toHaveClass('is-static');
  expect(surface.style.getPropertyValue('--glass-active')).toBe('0');
});
