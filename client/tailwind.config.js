/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff3fe',
          100: '#dde6fd',
          200: '#c3d0fb',
          300: '#99b0f8',
          400: '#7089f3',
          500: '#3B6CF5', // primary blue
          600: '#2d5be0',
          700: '#2449cc',
          800: '#1e3aaa',
          900: '#1a3088',
        },
        mojo: {
          pink: '#E8336D',
          dark: '#111827',
        },
      },
    },
  },
  plugins: [],
}
