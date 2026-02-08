import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            registerType: 'autoUpdate',
            manifest: {
                name: 'Entropy - Offline-First Messaging',
                short_name: 'Entropy',
                description: 'Secure, offline-first messaging application.',
                theme_color: '#0f172a',
                background_color: '#0f172a',
                display: 'standalone',
                orientation: 'portrait',
                icons: [
                    {
                        src: '/entropy.svg',
                        sizes: 'any',
                        type: 'image/svg+xml'
                    },
                    {
                        src: '/entropy.svg', // Ideally needed a PNG but SVG usually works in modern browsers or I should generate PNGs.
                        sizes: '192x192',
                        type: 'image/svg+xml'  // Should ideally be png for full compatibility but let's stick to svg if that's what we have.
                    },
                    {
                        src: '/entropy.svg',
                        sizes: '512x512',
                        type: 'image/svg+xml'
                    }
                ]
            }
        })
    ],
    define: {
        '__APP_VERSION__': JSON.stringify(new Date().toISOString()),
    },
    resolve: {
        alias: {
            '@': '/src',
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://localhost:8000',
                ws: true,
            },
        }
    }
});
