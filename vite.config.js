import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    base: './', // Ensures relative paths for assets
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
