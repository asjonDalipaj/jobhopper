import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';

const COLORS = ['#45787A', '#DD9C82', '#E9C46A', '#8FBF9F', '#C9B8E8'];

/**
 * The "Submitted" burst: two modest pops from the bottom corners, the way
 * canvas-confetti's demos do it. The library owns the canvas, physics and the
 * prefers-reduced-motion opt-out, so there is nothing to clean up but timers.
 *
 * The result usually lands while the user is still in the job window, so the
 * burst is held until the JobHopper tab is visible and focused again — firing
 * it into a hidden tab would waste it.
 */
export const Fireworks: React.FC = () => {
  useEffect(() => {
    let timers: number[] = [];
    let fired = false;

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

    function fire(): void {
      if (fired) return;
      fired = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      timers = [shoot(0.12, 58, 0), shoot(0.88, 122, 260)];
    }

    function onVisible(): void {
      if (document.visibilityState === 'visible') fire();
    }

    function onFocus(): void {
      fire();
    }

    if (document.visibilityState === 'visible' && document.hasFocus()) {
      fire();
    } else {
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onFocus);
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  return null;
};
