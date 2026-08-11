import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';

const { getMotionPreferences } = vi.hoisted(() => ({
  getMotionPreferences: vi.fn(),
}));

vi.mock('../../lib/preferences', () => ({
  getMotionPreferences,
}));

vi.mock('liquid-glass-react', () => ({
  default: ({ children, padding }: { children: ReactNode; padding?: string }) => (
    <div data-padding={padding} data-testid="liquid-glass">{children}</div>
  ),
}));

import { InspectorSurface } from './InspectorSurface';

beforeEach(() => {
  getMotionPreferences.mockReturnValue({ reduceMotion: false, reduceTransparency: true });
});

test('uses a solid surface when transparency is reduced', () => {
  const { container } = render(<InspectorSurface><p>内容</p></InspectorSurface>);

  expect(screen.getByText('内容').parentElement).toHaveClass('is-solid');
  expect(screen.getByText('内容').parentElement).toHaveAttribute('data-material', 'transient');
  expect(screen.getByText('内容').closest('.inspector-positioner')).toBeInTheDocument();
  expect(container.querySelector('.inspector-backdrop')).toBeNull();
  expect(document.body.querySelector('.inspector-backdrop')).toBeInTheDocument();
});

test('removes third-party glass padding so the dialog owns its viewport geometry', () => {
  getMotionPreferences.mockReturnValue({ reduceMotion: false, reduceTransparency: false });

  render(<InspectorSurface><p>内容</p></InspectorSurface>);

  expect(screen.getByTestId('liquid-glass')).toHaveAttribute('data-padding', '0');
});
