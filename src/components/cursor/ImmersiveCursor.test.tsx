import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const motionPreferences = vi.hoisted(() => ({ reduceMotion: false, reduceTransparency: false }));

vi.mock('../../lib/preferences', () => ({ getMotionPreferences: () => motionPreferences }));

import { ImmersiveCursor } from './ImmersiveCursor';

afterEach(() => {
  motionPreferences.reduceMotion = false;
  motionPreferences.reduceTransparency = false;
  vi.restoreAllMocks();
});

test('writes global pointer coordinates once per animation frame', () => {
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  render(<><button>操作</button><ImmersiveCursor /></>);

  fireEvent(screen.getByRole('button', { name: '操作' }), new MouseEvent('pointermove', { bubbles: true, clientX: 120, clientY: 64 }));
  frame?.(0);

  const cursor = screen.getByTestId('immersive-cursor');
  expect(cursor.style.getPropertyValue('--cursor-x')).toBe('120px');
  expect(cursor.style.getPropertyValue('--cursor-y')).toBe('64px');
  expect(cursor).toHaveAttribute('data-cursor-mode', 'control');
});

test('keeps the system cursor for editable content and removes its layer for reduced motion', () => {
  render(<><input aria-label="笔记" /><ImmersiveCursor /></>);

  fireEvent(screen.getByLabelText('笔记'), new MouseEvent('pointermove', { bubbles: true, clientX: 30, clientY: 24 }));
  expect(screen.getByTestId('immersive-cursor')).toHaveAttribute('data-cursor-mode', 'native');

  motionPreferences.reduceMotion = true;
  render(<ImmersiveCursor />);
  expect(screen.getAllByTestId('immersive-cursor').at(-1)).toHaveAttribute('data-cursor-enabled', 'false');
});
