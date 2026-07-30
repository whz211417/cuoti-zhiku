type PointerRect = Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;

export function normalizedPointerPosition(rect: PointerRect, clientX: number, clientY: number) {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const x = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 100 : 50;
  const y = rect.height > 0 ? ((clientY - rect.top) / rect.height) * 100 : 50;

  return {
    x: clamp(Math.round(x * 100) / 100),
    y: clamp(Math.round(y * 100) / 100),
  };
}
