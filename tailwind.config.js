/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sci-Fi color palette
        'space': {
          50: '#f0f4ff',
          100: '#e0e8ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#1e1b4b',
          900: '#0f0d24',
          950: '#080612',
        },
        'cyber': {
          green: '#00ff9f',
          blue: '#00d4ff',
          purple: '#bf00ff',
          pink: '#ff0080',
          yellow: '#ffff00',
          orange: '#ff6600',
        },
        'hull': {
          light: '#4a5568',
          DEFAULT: '#2d3748',
          dark: '#1a202c',
        },
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
        'display': ['Orbitron', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
