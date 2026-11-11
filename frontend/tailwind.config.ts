import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cw: {
          blue:         '#006393', // navigation, buttons, links
          'blue-light': '#1a7eab', // hover, focus, secondary accent
          link:         '#006393',
          cyan:         '#25b8ec', // brand cyan used in generated reports
          yellow:       '#f6dc6b', // selected navigation row
          gray:         '#e8e9e9', // page background
          border:       '#d5d6d7',
          'gray-text':  '#6b6e71',
          positive:     '#1f7a34',
          negative:     '#a32020',
          orange:       '#e07b00',
        },
      },
    },
  },
} satisfies Config;
