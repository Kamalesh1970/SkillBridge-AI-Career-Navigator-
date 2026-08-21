/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#ebf0ff',
          200: '#d6e0ff',
          300: '#b3c7ff',
          400: '#85a3ff',
          500: '#5275ff',
          600: '#2b47ff',
          700: '#1b2eff',
          800: '#1422d6',
          900: '#111ca6',
        },
        ai: {
          bg: '#06070B',
          panel: '#0F111E',
          purple: '#8B5CF6',
          cyan: '#06B6D4',
          emerald: '#10B981',
          coral: '#F43F5E',
          slate: '#94A3B8',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
