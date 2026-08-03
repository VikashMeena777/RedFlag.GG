'use client';

import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        className={cn('pill pill-ghost size-8 p-0 flex items-center justify-center text-ink-muted', className)}
        aria-label="Toggle theme"
      >
        <Sun className="size-4 opacity-40" />
      </button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'pill pill-ghost relative size-8 p-0 flex items-center justify-center text-ink-muted transition-colors hover:text-ink',
        className
      )}
      title={isDark ? 'Switch to Light Gazette Mode' : 'Switch to Dark Obsidian Mode'}
      aria-label="Toggle theme"
    >
      <Sun
        className={cn(
          'size-4 transition-all duration-300 transform',
          isDark ? 'scale-0 rotate-90 opacity-0 absolute' : 'scale-100 rotate-0 opacity-100'
        )}
      />
      <Moon
        className={cn(
          'size-4 transition-all duration-300 transform text-verdict-split',
          isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-90 opacity-0 absolute'
        )}
      />
    </button>
  );
}
