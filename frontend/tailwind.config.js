/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08090d',
          900: '#0d0f15',
          800: '#151823',
          700: '#1d2230',
          600: '#2a3041',
        },
        accent: {
          400: '#7c9cff',
          500: '#5b7cff',
          600: '#3b5bdb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(91,124,255,0.4), 0 8px 24px -8px rgba(91,124,255,0.4)',
      },
    },
  },
  plugins: [],
}
