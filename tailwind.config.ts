import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        f1red: '#E8002D',
        track: '#1a1a2e',
        surface: '#16213e',
        panel: '#0f3460',
        muted: '#a0a0b0',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
