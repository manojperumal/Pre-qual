/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf2f6',
          100: '#fce7ef',
          200: '#f9c5d6',
          300: '#f49db8',
          400: '#ee6a8e',
          500: '#E8336D',
          600: '#d42b5a',
          700: '#b82050',
          800: '#921845',
          900: '#75143a',
        },
        mojo: {
          black: '#0A0A0A',
          pink: '#E8336D',
          red: '#D42B2B',
        },
      },
      backgroundImage: {
        'mojo-gradient': 'linear-gradient(135deg, #E8336D, #D42B2B)',
      },
    },
  },
  plugins: [],
}
