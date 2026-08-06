import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#1a1a1a',
          dark: '#2d2d2d',
          text: '#4a5568',
          steel: '#64748b',
          muted: '#94a3b8',
          border: '#e2e8f0',
          bg: '#f1f5f9',
        },
        accent: {
          blue: '#3b82f6',
          'blue-soft': '#dbeafe',
          teal: '#0d9488',
          'teal-soft': '#ccfbf1',
          amber: '#f59e0b',
          'amber-soft': '#fef3c7',
        },
        status: {
          success: '#22c55e',
          error: '#ef4444',
        },
        // Admin-Design-Tokens (Light/Dark via CSS-Variablen, definiert in
        // app/globals.css unter .admin-shell[data-admin-theme]). Neue
        // Admin-Seiten/Komponenten nutzen diese statt Hex/brand-*.
        admin: {
          bg: 'var(--admin-bg)',
          surface: 'var(--admin-surface)',
          'surface-2': 'var(--admin-surface-2)',
          border: 'var(--admin-border)',
          heading: 'var(--admin-heading)',
          text: 'var(--admin-text)',
          'text-2': 'var(--admin-text-2)',
          muted: 'var(--admin-muted)',
          'muted-2': 'var(--admin-muted-2)',
          accent: 'var(--admin-accent)',
          'accent-hover': 'var(--admin-accent-hover)',
          'accent-soft': 'var(--admin-accent-soft)',
          danger: 'var(--admin-danger)',
        },
      },
      fontFamily: {
        heading: ['var(--font-sora)', 'sans-serif'],
        body: ['var(--font-dm-sans)', 'sans-serif'],
      },
      borderRadius: {
        btn: '10px',
        card: '16px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.07)',
        'card-hover': '0 10px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.08)',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        slideUp: 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.35s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
