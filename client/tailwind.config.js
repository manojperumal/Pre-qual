/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef1fb',
          100: '#d5dcf7',
          200: '#abb9ef',
          300: '#8196e7',
          400: '#6070e0', // card header
          500: '#4B6BF5', // primary
          600: '#3D5BE0', // hover
          700: '#3050cc', // dark
          800: '#2440b8', // darker
          900: '#1a2e8a', // darkest
        },
        mojo: {
          bg: '#EEF1F8',
          dark: '#1A1A2E',
        },
      },
    },
  },
  plugins: [],
}
