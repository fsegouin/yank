import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL ?? 'http://localhost:3001';

  return {
    plugins: [TanStackRouterVite({ routesDirectory: 'src/routes' }), react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true },
      },
    },
    preview: { host: '0.0.0.0', port: 5173 },
    build: { sourcemap: true, target: 'es2022' },
  };
});
