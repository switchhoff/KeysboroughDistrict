import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        club: {
          green: '#1e6b3a',   // badge outer ring green
          'green-dark': '#124425', // deeper shade for hovers
          'green-light': '#e8f5ee', // tint for backgrounds
          red: '#c01e1e',     // badge inner red
          'red-dark': '#8f1414',
          'red-light': '#fceaea', // tint for backgrounds
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
