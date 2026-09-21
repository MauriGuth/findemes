/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        mist: '#F8FAFC',
        accent: '#22C55E',
        warn: '#F59E0B',
        danger: '#EF4444',
      },
    },
  },
  plugins: [],
};
