import type { Config } from 'tailwindcss';

const config: Config = {
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
    },
  },
  plugins: [],
};

export default config;
