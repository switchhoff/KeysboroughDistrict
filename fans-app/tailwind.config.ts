import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        club: {
          green: '#1e6b3a',
          'green-dark': '#124425',
          'green-light': '#e8f5ee',
          red: '#c01e1e',
          'red-dark': '#8f1414',
          'red-light': '#fceaea',
        },
        gold: '#f5a623',
        silver: '#9b9b9b',
        bronze: '#cd7f32',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
