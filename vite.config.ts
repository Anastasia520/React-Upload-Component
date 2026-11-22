import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        watch: {
            // Upload data, not source code. With 100k seeded files the watcher took minutes of CPU and over 1 GB.
            ignored: ['**/uploads/**', '**/uploads-chunks/**'],
        },
    },
    test: {
        environment: 'happy-dom',
        env: {
            NODE_ENV: 'test',
        },
    },
});
