import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('../../lib/preferences', () => ({
  getMotionPreferences: () => ({ reduceMotion: false, reduceTransparency: true }),
}));

import { InspectorSurface } from './InspectorSurface';

test('uses a solid surface when transparency is reduced', () => {
  render(<InspectorSurface><p>内容</p></InspectorSurface>);

  expect(screen.getByText('内容').parentElement).toHaveClass('is-solid');
  expect(screen.getByText('内容').closest('.inspector-positioner')).toBeInTheDocument();
});
