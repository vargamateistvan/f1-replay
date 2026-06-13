import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        f1red:   '#E8002D',
        track:   '#15151e',
        surface: '#1f1f27',
        panel:   '#2a2a35',
        muted:   '#a3a3a3',
        // Sector / lap-time tier colours matching F1.com live timing
        'f1-purple': '#9b59f5',
        'f1-yellow': '#f5d400',
        'f1-green':  '#39b54a',
        // Tyre compound colours
        'tyre-soft':  '#e8002d',
        'tyre-med':   '#f5a623',
        'tyre-hard':  '#e0e0e0',
        'tyre-inter': '#39b54a',
        'tyre-wet':   '#1e90ff',
        // Flag banner colours
        'flag-yellow': '#f5d400',
        'flag-sc':     '#f5a623',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
