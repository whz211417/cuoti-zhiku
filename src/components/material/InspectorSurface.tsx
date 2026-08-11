import LiquidGlass from 'liquid-glass-react';
import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getMotionPreferences } from '../../lib/preferences';

export function InspectorSurface({ children }: { children: ReactNode }) {
  const surface = getMotionPreferences().reduceTransparency ? (
    <div className="inspector-surface is-solid" data-material="transient">{children}</div>
  ) : (
    <LiquidGlass aberrationIntensity={0} blurAmount={0.055} className="inspector-glass" cornerRadius={20} displacementScale={18} elasticity={0.09} mode="standard" overLight padding="0" saturation={108}>
      <div className="inspector-surface" data-material="transient">{children}</div>
    </LiquidGlass>
  );

  return createPortal(
    <div className="inspector-backdrop">
      <div className="inspector-positioner">{surface}</div>
    </div>,
    document.body,
  );
}
