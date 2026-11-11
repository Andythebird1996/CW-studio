import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cw: {
          blue:         '#006393', // navigation, buttons, links
          'blue-light': '#1a7eab', // hover, focus, secondary accent
          'blue-soft':  '#e7f3f8',
          link:         '#006393',
          cyan:         '#25b8ec', // legacy report cyan; do not use in UI
          yellow:       '#f6dc6b', // selected navigation row
          hover:        '#00547d',
          gray:         '#e8e9e9', // page background
          border:       '#d5d6d7',
          ink:          '#292c32',
          'gray-text':  '#6b6e71',
          positive:     '#1f7a34',
          'positive-soft': '#e8f5ec',
          negative:     '#a32020',
          'negative-soft': '#f8ecec',
          orange:       '#e07b00',
          'orange-soft': '#fdf3e6',
          info:         '#eaf4f8',
          finish:       '#2b8f16',
          radio:        '#c0c1c3',
          highlight:    '#fadb3f',
          badge:        '#db2c43',
        },
      },
    },
  },
} satisfies Config;
