import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
    base: './', // Ensures relative paths for assets
    plugins: [
        viteStaticCopy({
            targets: [
                {
                    src: ['*.js', '!vite.config.js'],
                    dest: '.'
                }
            ]
        })
    ],
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
