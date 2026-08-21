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
        minimal: {
          bg: '#FAF9F6',
          card: '#ffffff',
          border: '#E5E7EB',
          text: '#111827',
          grey: '#6B7280',
          slate: '#3E4A56',
          green: '#2F5C47',
          red: '#A34F4F',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
        mono: ['monospace'],
      }
    },
  },
  plugins: [],
}
