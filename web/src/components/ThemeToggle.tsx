import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../theme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      onClick={toggleTheme}
      className="relative inline-flex items-center w-14 h-7 rounded-full cursor-pointer select-none transition-colors duration-300 outline-none focus-visible:ring-2 ring-ring bg-surface-well border border-line shadow-inner"
    >
      {/* Sliding knob with rotating sun/moon icon */}
      <motion.div
        className="absolute top-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-surface border border-line shadow-md"
        animate={{ left: isDark ? 'calc(100% - 1.5rem - 2px)' : '2px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.7 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="flex items-center justify-center"
          >
            {isDark ? (
              <Moon className="w-3.5 h-3.5 text-indigo-400" strokeWidth={2.2} />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-500" strokeWidth={2.2} />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.div>
    </button>
  );
}