import React, { useEffect, useRef } from 'react';

/**
 * A small, self-contained firework burst for the "Submitted" moment.
 * Canvas-only (no dependency), two or three pops, and it renders nothing
 * animated when the user prefers reduced motion.
 */
export const Fireworks: React.FC<{ className?: string }> = ({ className }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.scale(dpr, dpr);

    const palette = ['#45787A', '#DD9C82', '#E9C46A', '#8FBF9F', '#C9B8E8'];

    type Particle = { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string; size: number };
    let particles: Particle[] = [];
    let frame = 0;

    const pop = (cx: number, cy: number, count: number, speed: number, now: number) => {
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
        const velocity = speed * (0.55 + Math.random() * 0.65);
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          born: now,
          life: 850 + Math.random() * 500,
          color: palette[Math.floor(Math.random() * palette.length)] as string,
          size: 1.6 + Math.random() * 1.4,
        });
      }
    };

    if (reduce) {
      // Static, calm version: a single ring of dots, no animation loop.
      const now = performance.now();
      pop(width * 0.5, height * 0.55, 14, 0.0001, now);
      for (const particle of particles) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const started = performance.now();
    const bursts = [
      { at: 0, x: width * 0.5, y: height * 0.58, count: 26, speed: 0.16 },
      { at: 260, x: width * 0.28, y: height * 0.5, count: 16, speed: 0.12 },
      { at: 430, x: width * 0.74, y: height * 0.46, count: 16, speed: 0.12 },
    ];
    let fired = 0;

    const tick = (now: number) => {
      const elapsed = now - started;
      while (fired < bursts.length && elapsed >= (bursts[fired]?.at ?? 0)) {
        const burst = bursts[fired];
        if (burst) pop(burst.x, burst.y, burst.count, burst.speed, now);
        fired += 1;
      }

      ctx.clearRect(0, 0, width, height);
      const dt = 16.7;
      particles = particles.filter((particle) => now - particle.born < particle.life);
      for (const particle of particles) {
        const age = (now - particle.born) / particle.life;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 0.00012 * dt; // a little gravity
        particle.vx *= 0.985;
        particle.vy *= 0.985;
        ctx.globalAlpha = Math.max(0, 1 - age) * 0.95;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (1 - age * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }

      if (fired < bursts.length || particles.length > 0) {
        frame = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
};
