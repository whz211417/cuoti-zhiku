import LiquidGlass from 'liquid-glass-react';
import { type ReactNode } from 'react';
import { getMotionPreferences } from '../../lib/preferences';

export function InspectorSurface({ children }: { children: ReactNode }) {
  if (getMotionPreferences().reduceTransparency) return <div className="inspector-surface is-solid">{children}</div>;

  return (
    <LiquidGlass aberrationIntensity={0} blurAmount={0.055} className="inspector-glass" cornerRadius={20} displacementScale={18} elasticity={0.09} mode="standard" overLight saturation={108}>
      <div className="inspector-surface">{children}</div>
    </LiquidGlass>
  );
}
