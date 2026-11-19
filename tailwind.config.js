/** Adire-inspired palette: indigo cloth, chalk paper, marigold for money. */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        adire: { 50: '#EEF0FA', 100: '#DDE1F4', 200: '#B9C1E6', 300: '#8D99D3', 500: '#3A4AA8', 600: '#2D3B8F', 700: '#23307A', 800: '#1A2460', 900: '#111846' },
        ink: '#14172B',
        chalk: '#F6F7FB',
        rule: '#D3D9EA',
        marigold: { 100: '#FBEFC8', 400: '#EBB62B', 500: '#E0A100', 700: '#8A6200' },
        ok: { 100: '#DDF3E6', 700: '#1B6B3A' },
        bad: { 100: '#FBE0DC', 700: '#A32A1C' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
