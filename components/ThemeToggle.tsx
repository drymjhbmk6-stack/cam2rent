'use client';

import { useTheme } from '@/components/ThemeProvider';

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggle = () => {
    // Einfacher Toggle: Hell → Dunkel → Hell
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="relative p-2 text-brand-text dark:text-gray-400 hover:text-brand-black dark:hover:text-gray-100 transition-colors"
      aria-label={resolvedTheme === 'dark' ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
      title={resolvedTheme === 'dark' ? 'Heller Modus' : 'Dunkler Modus'}
    >
      {/* Sonne (sichtbar im Dunkelmodus) */}
      <svg
        className={`w-5 h-5 absolute inset-0 m-auto transition-all duration-300 ${
          resolvedTheme === 'dark'
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 -rotate-90 scale-0'
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
      {/* Mond (sichtbar im Hellmodus) */}
      <svg
        className={`w-5 h-5 transition-all duration-300 ${
          resolvedTheme === 'dark'
            ? 'opacity-0 rotate-90 scale-0'
            : 'opacity-100 rotate-0 scale-100'
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    </button>
  );
}
