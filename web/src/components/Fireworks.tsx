import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';

const COLORS = ['#45787A', '#DD9C82', '#E9C46A', '#8FBF9F', '#C9B8E8'];

/**
 * The "Submitted" burst: two modest pops from the bottom corners, the way
 * canvas-confetti's demos do it. The library owns the canvas, physics and the
 * prefers-reduced-motion opt-out, so there is nothing to clean up but timers.
 */
export const Fireworks: React.FC = () => {
  useEffect(() => {
    const shoot = (x: number, angle: number, delay: number) =>
      window.setTimeout(() => {
        void confetti({
          particleCount: 45,
          spread: 62,
          startVelocity: 42,
          angle,
          origin: { x, y: 0.88 },
          scalar: 0.9,
          ticks: 140,
          colors: COLORS,
          disableForReducedMotion: true,
        });
      }, delay);

    const timers = [shoot(0.12, 58, 0), shoot(0.88, 122, 260)];
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  return null;
};
