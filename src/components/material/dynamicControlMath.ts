type PointerRect = Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;

export function localPointerPosition(rect: PointerRect, clientX: number, clientY: number) {
  const clamp = (value: number, maximum: number) => Math.min(maximum, Math.max(0, value));
  const round = (value: number) => Math.round(value * 100) / 100;

  return {
    x: rect.width > 0 ? round(clamp(clientX - rect.left, rect.width)) : 0,
    y: rect.height > 0 ? round(clamp(clientY - rect.top, rect.height)) : 0,
  };
}
