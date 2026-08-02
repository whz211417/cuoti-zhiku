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
import { localPointerPosition } from './dynamicControlMath';

afterEach(() => {
  motionPreferences.reduceMotion = false;
  motionPreferences.reduceTransparency = false;
  vi.restoreAllMocks();
});

test('returns clamped local pixel coordinates inside a surface', () => {
  const rect = { left: 20, top: 10, width: 200, height: 100 };

  expect(localPointerPosition(rect, 120, 60)).toEqual({ x: 100, y: 50 });
  expect(localPointerPosition(rect, -50, 500)).toEqual({ x: 0, y: 100 });
  expect(localPointerPosition({ ...rect, width: 0, height: 0 }, 120, 60)).toEqual({ x: 0, y: 0 });
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

  expect(surface.style.getPropertyValue('--glass-local-x')).toBe('100px');
  expect(surface.style.getPropertyValue('--glass-local-y')).toBe('50px');
  expect(surface.style.getPropertyValue('--glass-active')).toBe('1');
  expect(requestFrameSpy).toHaveBeenCalledTimes(1);
  expect(rectSpy).toHaveBeenCalledTimes(1);
  expect(surface.querySelector('.dynamic-glass-light')).toBeInTheDocument();
  expect(surface).toHaveAttribute('data-material', 'navigation');

  fireEvent.pointerLeave(surface);
  expect(surface.style.getPropertyValue('--glass-active')).toBe('0');
  expect(surface.style.getPropertyValue('--glass-local-x')).toBe('50%');
  expect(surface.style.getPropertyValue('--glass-local-y')).toBe('0px');
});

test('reads a fresh surface rectangle for every rendered pointer frame', () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });

  render(
    <DynamicControlSurface aria-label="layout-aware-surface" as="header">
      <span>Toolbar</span>
    </DynamicControlSurface>,
  );

  const surface = screen.getByLabelText('layout-aware-surface');
  const makeRect = (left: number, top: number) => ({
    bottom: top + 100,
    height: 100,
    left,
    right: left + 200,
    top,
    width: 200,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
  const rectSpy = vi.spyOn(surface, 'getBoundingClientRect')
    .mockReturnValueOnce(makeRect(0, 0))
    .mockReturnValueOnce(makeRect(100, 50));

  fireEvent(surface, new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 50 }));
  frames.shift()?.(0);
  fireEvent(surface, new MouseEvent('pointermove', { bubbles: true, clientX: 140, clientY: 70 }));
  frames.shift()?.(16);

  expect(rectSpy).toHaveBeenCalledTimes(2);
  expect(surface.style.getPropertyValue('--glass-local-x')).toBe('40px');
  expect(surface.style.getPropertyValue('--glass-local-y')).toBe('20px');
});

test('uses a static surface when motion or transparency is reduced', () => {
  motionPreferences.reduceTransparency = true;

  render(<DynamicControlSurface aria-label="静态工具栏" as="header">工具</DynamicControlSurface>);

  const surface = screen.getByLabelText('静态工具栏');
  fireEvent.pointerMove(surface, { clientX: 80, clientY: 20 });

  expect(surface).toHaveClass('is-static');
  expect(surface.style.getPropertyValue('--glass-active')).toBe('0');
});
