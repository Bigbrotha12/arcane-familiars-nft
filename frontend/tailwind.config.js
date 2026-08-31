/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './dist/*.html', './dist/*.js'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    fontFamily: {
      display: ['Fredoka', 'sans-serif'],
      body: ['DM Sans', 'sans-serif'],
      mono: ['JetBrains Mono', 'monospace'],
    },
    extend: {
      colors: {
        accent: {
          DEFAULT: '#7C5CFC',
          hover: '#6A4AE8',
          light: '#EDE7FF',
        },
        teal: '#2DD4BF',
        pink: '#F472B6',
        yellow: '#FBBF24',
        surface: {
          primary: '#FFF8F0',
          secondary: '#FFF1E0',
          card: '#FFFFFF',
          alt: '#FAF5ED',
        },
        text: {
          primary: '#1E1B4B',
          secondary: '#6366A1',
          muted: '#A5A3C4',
        },
        border: '#E8E4F0',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '20px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(30, 27, 75, 0.06)',
        'card-hover': '0 8px 24px rgba(30, 27, 75, 0.1)',
        btn: '0 2px 4px rgba(124, 92, 252, 0.2)',
        'btn-hover': '0 4px 12px rgba(124, 92, 252, 0.3)',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0, 0, 0.2, 1)',
        'ease-in-expo': 'cubic-bezier(0.4, 0, 1, 1)',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};
