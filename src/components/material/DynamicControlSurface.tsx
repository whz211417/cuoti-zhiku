import { createElement, type HTMLAttributes, type ReactNode } from 'react';

type SurfaceElement = 'aside' | 'div' | 'header';

type DynamicControlSurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: SurfaceElement;
  children: ReactNode;
};

/**
 * A static navigation material. Pointer feedback belongs to the control being
 * used, so this wrapper deliberately performs no global pointer tracking.
 */
export function DynamicControlSurface({
  as = 'div',
  children,
  className = '',
  ...rest
}: DynamicControlSurfaceProps) {
  return createElement(
    as,
    {
      ...rest,
      className: `dynamic-control-surface${className ? ` ${className}` : ''}`,
      'data-material': 'navigation',
    },
    children,
  );
}
