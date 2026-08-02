import {
  createElement,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';
import { getMotionPreferences } from '../../lib/preferences';
import { localPointerPosition } from './dynamicControlMath';

type SurfaceElement = 'aside' | 'div' | 'header';

type DynamicControlSurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: SurfaceElement;
  children: ReactNode;
};

type MaterialStyle = CSSProperties & {
  '--glass-active': number;
  '--glass-local-x': string;
  '--glass-local-y': string;
};

const centerMaterialStyle: MaterialStyle = {
  '--glass-active': 0,
  '--glass-local-x': '50%',
  '--glass-local-y': '0px',
};

/**
 * An iOS 26-inspired web material approximation for persistent controls.
 * Pointer coordinates are written directly to CSS variables so React never
 * re-renders while the pointer is moving.
 */
export function DynamicControlSurface({
  as = 'div',
  children,
  className = '',
  onPointerLeave,
  onPointerMove,
  style,
  ...rest
}: DynamicControlSurfaceProps) {
  const surfaceRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef<{ clientX: number; clientY: number; target: HTMLElement } | null>(null);
  const preferences = getMotionPreferences();
  const isStatic = preferences.reduceMotion || preferences.reduceTransparency;

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const updateMaterial = (x: number | string, y: number | string, active: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.style.setProperty('--glass-local-x', typeof x === 'number' ? `${x}px` : x);
    surface.style.setProperty('--glass-local-y', typeof y === 'number' ? `${y}px` : y);
    surface.style.setProperty('--glass-active', `${active}`);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    onPointerMove?.(event);
    if (isStatic) return;

    pointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.currentTarget,
    };
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      const pointer = pointerRef.current;
      if (!pointer) {
        frameRef.current = null;
        return;
      }
      const rect = pointer.target.getBoundingClientRect();
      const point = localPointerPosition(rect, pointer.clientX, pointer.clientY);
      updateMaterial(point.x, point.y, 1);
      frameRef.current = null;
    });
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
    onPointerLeave?.(event);
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pointerRef.current = null;
    updateMaterial('50%', '0px', 0);
  };

  return createElement(
    as,
    {
      ...rest,
      className: `dynamic-control-surface${isStatic ? ' is-static' : ''}${className ? ` ${className}` : ''}`,
      'data-material': 'navigation',
      onPointerLeave: handlePointerLeave,
      onPointerMove: handlePointerMove,
      ref: surfaceRef,
      style: { ...centerMaterialStyle, ...style },
    },
    createElement('span', { 'aria-hidden': true, className: 'dynamic-glass-light' }),
    children,
  );
}
