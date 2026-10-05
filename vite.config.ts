import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['logo.png'],
        workbox: {
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB (after splitting, chunks are smaller)
        },
        manifest: {
          name: 'Hệ thống Quản trị Nguồn lực Thi công CDX',
          short_name: 'CDX Nguồn Lực',
          description: 'Hệ thống Quản trị Nguồn lực Thi công CDX',
          theme_color: '#2D5A27',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'logo.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'logo.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('exceljs') || id.includes('xlsx')) {
              return 'excel';
            }
            if (id.includes('lucide-react') || id.includes('motion')) {
              return 'ui';
            }
            if (id.includes('html-to-image')) {
              return 'utils';
            }
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
