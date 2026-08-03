import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import authGatePlugin from './vite-plugin-auth-gate.js';
import blobAssetPlugin from './vite-plugin-blob.js';
import svgUse from './vite-plugin-svg-use.js';
import uploadPlugin from './vite-plugin-upload.js';
// import purgecss from 'vite-plugin-purgecss';
import { playwright } from '@vitest/browser-playwright';
import { execSync } from 'child_process';
import purgecss from 'vite-plugin-purgecss';

function proxyAudioPlugin() {
    return {
        name: 'proxy-audio-dev',
        configureServer(server) {
            // No longer needed: local proxy-audio middleware replaced by remote proxy
        },
    };
}

function getGitCommitHash() {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
        return 'unknown';
    }
}

export default defineConfig((_options) => {
    const commitHash = getGitCommitHash();

    return {
        test: {
            // https://vitest.dev/guide/browser/
            browser: {
                enabled: true,
                provider: playwright(),
                headless: !!process.env.HEADLESS,
                instances: [{ browser: 'chromium' }],
            },
        },
        base: './',
        define: {
            __COMMIT_HASH__: JSON.stringify(commitHash),
            __VITEST__: !!process.env.VITEST,
        },
        worker: {
            format: 'es',
        },
        resolve: {
            alias: {
                '!lucide': '/node_modules/lucide-static/icons',
                '!simpleicons': '/node_modules/simple-icons/icons',
                '!': '/node_modules',

                events: '/node_modules/events/events.js',
                pocketbase: '/node_modules/pocketbase/dist/pocketbase.es.js',
                stream: path.resolve(__dirname, 'stream-stub.js'), // Stub for stream module
            },
        },
        optimizeDeps: {
            exclude: ['pocketbase', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
        },
        server: {
            host: true,
            proxy: {
                '/api/selfhost': {
                    target: process.env.VITE_SELFHOST_IMPORTER_PROXY_TARGET || 'http://127.0.0.1:8787',
                    changeOrigin: true,
                },
                '/api': {
                    target: process.env.VITE_POCKETBASE_PROXY_TARGET || 'http://127.0.0.1:8090',
                    changeOrigin: true,
                },
                '/_': {
                    target: process.env.VITE_POCKETBASE_PROXY_TARGET || 'http://127.0.0.1:8090',
                    changeOrigin: true,
                },
            },
            fs: {
                allow: ['.', 'node_modules'],
                // allowedHosts: ['<your_tailscale_hostname>'], // e.g. pi5.tailf5f622.ts.net
            },
        },
        preview: {
            host: true,
            port: 3000,
            allowedHosts: true,
        },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            sourcemap: true,
            minify: 'terser',
            terserOptions: {
                compress: {
                    drop_console: true,
                    drop_debugger: true,
                },
            },
            rollupOptions: {
                treeshake: true,
            },
        },
        plugins: [
            proxyAudioPlugin(),
            purgecss({
                variables: false, // DO NOT REMOVE UNUSED VARIABLES (breaks lyrics web components)
                safelist: {
                    standard: [
                        /^spicy-lyrics/,
                        /^SpicyLyrics/,
                        /^Lyrics/,
                        /^VirtualLyrics/,
                        /^(?:SpicyRenderer|UseSpicyFont|SimpleLyricsMode|MinimalLyricsMode|Fullscreen|Active|NotSung|Sung|FeelSung|OppositeAligned|HasDuetLines|HasRtlLines|HideLineBlur|InstantScroll|pre-hidden|musical-line|dotGroup|dot|word|word-group|letter|letterGroup|PartOfWord|LastWordInLine|LastLetterInWord|Emphasis|bg-line|bg-word|rtl)$/,
                        /^lyplus-/,
                        'sidepanel',
                        'side-panel',
                        'active',
                        'show',
                        /^data-/,
                        /^modal-/,
                    ],
                    deep: [/^spicy-lyrics/, /^SpicyLyrics/, /^Lyrics/],
                    greedy: [/^lyplus-/, /sidepanel/, /side-panel/],
                },
            }),
            authGatePlugin(),
            uploadPlugin(),
            blobAssetPlugin(),
            svgUse(),
            VitePWA({
                registerType: 'autoUpdate',
                workbox: {
                    globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
                    cleanupOutdatedCaches: true,
                    skipWaiting: true,
                    clientsClaim: true,
                    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB limit
                    // Define runtime caching strategies
                    runtimeCaching: [
                        {
                            urlPattern: ({ request }) => request.destination === 'image',
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'images',
                                expiration: {
                                    maxEntries: 100,
                                    maxAgeSeconds: 60 * 24 * 60 * 60, // 60 Days
                                },
                            },
                        },
                        {
                            urlPattern: ({ request }) =>
                                request.destination === 'audio' || request.destination === 'video',
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'media',
                                expiration: {
                                    maxEntries: 50,
                                    maxAgeSeconds: 60 * 24 * 60 * 60, // 60 Days
                                },
                                rangeRequests: true, // Support scrubbing
                            },
                        },
                    ],
                },
                manifest: false, // Use existing public/manifest.json
            }),
        ],
    };
});
