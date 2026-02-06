/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                surface: {
                    DEFAULT: 'var(--bg-surface)',   // #121417
                    hover: 'var(--bg-surface-hover)', // #1a1d21
                    root: 'var(--bg-root)',         // #0b0c0e
                    sidebar: 'var(--bg-sidebar)',   // #0f1013
                    glass: 'rgba(18, 20, 23, 0.7)',
                },
                border: {
                    DEFAULT: 'var(--border-subtle)', // #1e2124
                    strong: 'var(--border-strong)',  // #2a2d32
                    glass: 'rgba(255, 255, 255, 0.05)',
                },
                txt: {
                    primary: 'var(--text-primary)',    // #ededef
                    secondary: 'var(--text-secondary)', // #9da2ae
                    tertiary: 'var(--text-tertiary)',   // #60646c
                },
                accent: {
                    DEFAULT: 'var(--accent-primary)',   // #5e6ad2
                    hover: 'var(--accent-hover)',       // #4e5ac0
                    surface: 'var(--accent-surface)',   // rgba(94, 106, 210, 0.1)
                    text: '#818cf8',
                }
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
            fontSize: {
                '2xs': ['10px', '14px'],
            },
            animation: {
                'fade-in': 'fadeIn 0.2s ease-out',
                'slide-in': 'slideIn 0.3s ease-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideIn: {
                    '0%': { transform: 'translateX(-10px)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
}
