/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        sidebar: {
          DEFAULT: '#ffffff',
          foreground: '#1f2937',
          muted: '#6b7280',
          border: '#e5e7eb',
          accent: '#f3f4f6',
          active: '#eef2ff',
        },
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
        }
      }
    },
  },
  plugins: [],
}
