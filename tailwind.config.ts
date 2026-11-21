import { type Config } from 'tailwindcss';

// Theme colours come from CSS variables in src/client/theme.css, so the brand can be changed without touching
// components.
const themeColor = (name: string): string => `var(--color-${name})`;

export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                primary: { DEFAULT: themeColor('primary'), hover: themeColor('primary-hover') },
                secondary: themeColor('secondary'),
                surface: { DEFAULT: themeColor('surface'), hover: themeColor('surface-hover') },
                line: themeColor('line'),
                error: themeColor('error'),
                success: themeColor('success'),
                focus: themeColor('focus'),
            },
        },
    },
    plugins: [],
} satisfies Config;
