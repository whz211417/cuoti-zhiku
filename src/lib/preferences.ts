export type MotionPreferences = {
  reduceMotion: boolean;
  reduceTransparency: boolean;
};

export function getMotionPreferences(): MotionPreferences {
  const matches = (query: string) => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;

  return {
    reduceMotion: matches('(prefers-reduced-motion: reduce)'),
    reduceTransparency: matches('(prefers-reduced-transparency: reduce)'),
  };
}
