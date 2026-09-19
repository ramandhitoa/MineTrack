import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['android-chrome-192x192.png', 'android-chrome-512x512.png'],
			manifest: {
				name: 'Grade Control AKP',
				short_name: 'Grade Control AKP',
				description: 'Dashboard produksi dan absensi',
				theme_color: '#0b132b',
				background_color: '#0b132b',
				display: 'standalone',
				scope: '/',
				start_url: '/',
				icons: [
					{
						src: '/android-chrome-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/android-chrome-512x512.png',
						sizes: '512x512',
						type: 'image/png'
					}
				]
			}
		})
	],
	build: {
		chunkSizeWarningLimit: 1000,
	},
});
