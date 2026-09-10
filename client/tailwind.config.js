/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#00838F',
          cyan:    '#00A7B5',
          lime:    '#7CB342',
          dark:    '#10262A',
          navy:    '#0A1C1F',
          light:   '#E0F2F1',
          muted:   '#5A7A7D',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #00838F 0%, #00A7B5 50%, #7CB342 100%)',
        'brand-gradient-subtle': 'linear-gradient(135deg, #E0F2F1 0%, #F1F8E9 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
