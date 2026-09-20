import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { DynamicControlSurface } from './DynamicControlSurface';

test('keeps navigation material static while preserving native pointer events', () => {
  const requestFrameSpy = vi.spyOn(window, 'requestAnimationFrame');
  const onPointerMove = vi.fn();

  render(
    <DynamicControlSurface aria-label="安静工具栏" as="header" onPointerMove={onPointerMove}>
      <button type="button">工具</button>
    </DynamicControlSurface>,
  );

  const surface = screen.getByLabelText('安静工具栏');
  fireEvent.pointerMove(surface, { clientX: 80, clientY: 20 });

  expect(onPointerMove).toHaveBeenCalledTimes(1);
  expect(requestFrameSpy).not.toHaveBeenCalled();
  expect(surface).toHaveAttribute('data-material', 'navigation');
  expect(surface).not.toHaveAttribute('style');
  expect(surface.querySelector('.dynamic-glass-light')).not.toBeInTheDocument();
});
