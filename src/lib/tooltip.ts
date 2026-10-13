// Below the chip, or above it when near the bottom of the window; kept inside the viewport.
import type { CSSProperties } from 'react';

export function tipPosition(r: DOMRect): CSSProperties {
  const left = Math.max(8, Math.min(r.left, window.innerWidth - 308));
  return r.bottom > window.innerHeight - 220
    ? { left, bottom: window.innerHeight - r.top + 6 }
    : { left, top: r.bottom + 6 };
}
