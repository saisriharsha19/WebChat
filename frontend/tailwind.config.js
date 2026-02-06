/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Mapping tokens to CSS variables for dynamic feel
                surface: {
                    DEFAULT: 'var(--bg-surface)',
                    hover: 'var(--bg-surface-hover)',
                    root: 'var(--bg-root)',
                    sidebar: 'var(--bg-sidebar)',
                },
                border: {
                    DEFAULT: 'var(--border-subtle)',
                    strong: 'var(--border-strong)',
                },
                txt: {
                    primary: 'var(--text-primary)',
                    secondary: 'var(--text-secondary)',
                    tertiary: 'var(--text-tertiary)',
                },
                accent: {
                    DEFAULT: 'var(--accent-primary)',
                    hover: 'var(--accent-hover)',
                    surface: 'var(--accent-surface)',
                }
            },
            fontSize: {
                '2xs': ['10px', '14px'],
            }
        },
    },
    plugins: [],
}
