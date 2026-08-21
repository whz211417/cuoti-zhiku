import { useEffect, useRef } from 'react';
import { getMotionPreferences } from '../../lib/preferences';
import { cursorModeForTarget } from './cursorTarget';

type PointerSnapshot = { x: number; y: number; target: EventTarget | null };

export function ImmersiveCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef<PointerSnapshot | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const preferences = getMotionPreferences();
  const finePointer = typeof window === 'undefined'
    || !window.matchMedia
    || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const enabled = finePointer && !preferences.reduceMotion && !preferences.reduceTransparency;

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add('has-immersive-cursor');

    const renderPointer = () => {
      const cursor = cursorRef.current;
      const pointer = pointerRef.current;
      if (!cursor || !pointer) {
        frameRef.current = null;
        return;
      }
      cursor.style.setProperty('--cursor-x', `${pointer.x}px`);
      cursor.style.setProperty('--cursor-y', `${pointer.y}px`);
      cursor.dataset.cursorMode = cursorModeForTarget(pointer.target);
      cursor.dataset.cursorVisible = 'true';
      frameRef.current = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      pointerRef.current = { x: event.clientX, y: event.clientY, target: event.target };
      if (cursorRef.current) cursorRef.current.dataset.cursorMode = cursorModeForTarget(event.target);
      if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(renderPointer);
    };
    const hidePointer = () => {
      pointerRef.current = null;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (cursorRef.current) cursorRef.current.dataset.cursorVisible = 'false';
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const cursor = cursorRef.current;
      if (!cursor || cursor.dataset.cursorMode === 'native') return;
      cursor.dataset.cursorPressed = 'true';
      if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = window.setTimeout(() => {
        if (cursorRef.current) cursorRef.current.dataset.cursorPressed = 'false';
        pressTimerRef.current = null;
      }, 120);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) hidePointer();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('blur', hidePointer);
    return () => {
      root.classList.remove('has-immersive-cursor');
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('blur', hidePointer);
    };
  }, [enabled]);

  return <div aria-hidden="true" className="immersive-cursor" data-cursor-enabled={enabled} data-cursor-mode="default" data-cursor-visible="false" data-testid="immersive-cursor" ref={cursorRef} />;
}
