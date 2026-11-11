import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cw: {
          blue:       '#1a5276',   // dark navy — toolbar, primary buttons
          'blue-light': '#25b8ec', // Checkware brand cyan — accents, focus
          link:       '#3c73b7',   // interactive link blue
          gray:       '#f4f4f4',   // page/panel background
          border:     '#e0e3e6',   // borders
          'gray-text': '#808080',  // labels, metadata
          positive:   '#008800',
          negative:   '#880000',
          orange:     '#f78d28',
        },
      },
    },
  },
} satisfies Config;
