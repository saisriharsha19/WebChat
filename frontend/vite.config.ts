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
            devOptions: {
                enabled: true,
                type: 'module',
            },
            manifest: {
                name: 'Entropy - Offline-First Messaging',
                short_name: 'Entropy',
                description: 'Secure, offline-first messaging application.',
                theme_color: '#0f172a',
                background_color: '#0f172a',
                display: 'standalone',
                orientation: 'portrait',
                id: '/',
                start_url: '/',
                scope: '/',
                icons: [
                    {
                        src: '/entropy.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    },
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ],
                screenshots: [
                    {
                        src: '/screenshot-desktop.png',
                        sizes: '1920x1080',
                        type: 'image/png',
                        form_factor: 'wide',
                        label: 'Desktop Dashboard'
                    },
                    {
                        src: '/screenshot-mobile.png',
                        sizes: '1080x1920',
                        type: 'image/png',
                        form_factor: 'narrow',
                        label: 'Mobile Chat'
                    }
                ],
                shortcuts: [
                    {
                        name: 'Friends',
                        short_name: 'Friends',
                        description: 'View your friends list',
                        url: '/friends',
                        icons: [{ src: '/entropy.svg', sizes: '192x192' }]
                    }
                ],
                categories: ['social', 'productivity', 'utilities'],
                launch_handler: {
                    client_mode: 'focus-existing'
                },
                share_target: {
                    action: '/share',
                    method: 'POST',
                    enctype: 'multipart/form-data',
                    params: {
                        title: 'title',
                        text: 'text',
                        url: 'url',
                        files: [
                            {
                                name: 'media',
                                accept: ['image/*', 'video/*']
                            }
                        ]
                    }
                }
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'gstatic-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
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
