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
import { normalizedPointerPosition } from './dynamicControlMath';

type SurfaceElement = 'aside' | 'div' | 'header';

type DynamicControlSurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: SurfaceElement;
  children: ReactNode;
};

type MaterialStyle = CSSProperties & {
  '--glass-active': number;
  '--glass-shift-x': string;
  '--glass-shift-y': string;
  '--glass-x': string;
  '--glass-y': string;
};

const centerMaterialStyle: MaterialStyle = {
  '--glass-active': 0,
  '--glass-shift-x': '0px',
  '--glass-shift-y': '0px',
  '--glass-x': '50%',
  '--glass-y': '0%',
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
  const rectRef = useRef<DOMRect | null>(null);
  const pointerRef = useRef<{ clientX: number; clientY: number; target: HTMLElement } | null>(null);
  const preferences = getMotionPreferences();
  const isStatic = preferences.reduceMotion || preferences.reduceTransparency;

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const updateMaterial = (x: number, y: number, active: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.style.setProperty('--glass-x', `${x}%`);
    surface.style.setProperty('--glass-y', `${y}%`);
    surface.style.setProperty('--glass-shift-x', `${Math.round((x - 50) * 0.44 * 100) / 100}px`);
    surface.style.setProperty('--glass-shift-y', `${Math.round((y - 50) * 0.28 * 100) / 100}px`);
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
      const rect = rectRef.current ?? pointer.target.getBoundingClientRect();
      rectRef.current = rect;
      const point = normalizedPointerPosition(rect, pointer.clientX, pointer.clientY);
      updateMaterial(point.x, point.y, 1);
      frameRef.current = null;
    });
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
    onPointerLeave?.(event);
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    rectRef.current = null;
    pointerRef.current = null;
    updateMaterial(50, 0, 0);
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
