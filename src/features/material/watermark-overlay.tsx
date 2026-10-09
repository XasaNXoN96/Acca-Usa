"use client";

import { useEffect, useState } from "react";

/**
 * Semi-transparent personal watermark over a protected viewer (image / video). It drifts to a new position every few
 * seconds so it cannot be cropped out of a single corner. Decorative for assistive technology and never intercepts input.
 */
export function WatermarkOverlay({ text }: { text: string }) {
  const [pos, setPos] = useState({ x: 12, y: 18 });
  useEffect(() => {
    const id = window.setInterval(() => setPos({ x: 4 + Math.random() * 56, y: 8 + Math.random() * 68 }), 6000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div aria-hidden data-watermark className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      <span
        className="absolute whitespace-nowrap rounded bg-black/10 px-2 py-0.5 text-xs font-semibold text-white/55 mix-blend-difference transition-all duration-[1800ms] sm:text-sm"
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      >
        {text}
      </span>
    </div>
  );
}
