/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        cream: '#f8fafc',
        lilac: '#ede9fe',
        mint: '#d1fae5',
      },
      boxShadow: {
        soft: '0 18px 45px rgba(15, 23, 42, 0.10)',
        glow: '0 20px 55px rgba(99, 102, 241, 0.18)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
