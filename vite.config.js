import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // Ensures relative paths for assets, critical for GH Pages subdirectory deployment
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
