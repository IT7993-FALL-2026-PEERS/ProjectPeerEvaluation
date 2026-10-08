import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vite replaces process.env.NODE_ENV by itself. REACT_APP_API_URL is the one value the app reads from
// the environment (src/frontend/services/apiUrl.js); it is written into the bundle at build time, so
// it comes from the build's environment (Render, the Docker build argument) or from a .env file.
export default defineConfig(({ mode }) => {
  // The third argument is required: by default loadEnv keeps only VITE_ names, which would drop
  // REACT_APP_API_URL and silently send a deployed build to the fallback backend.
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const apiUrl = process.env.REACT_APP_API_URL || env.REACT_APP_API_URL || '';

  // A Render build without it would fall back to a backend that is not this deployment's. Fail instead.
  if (process.env.RENDER && !apiUrl) {
    throw new Error('REACT_APP_API_URL is not set for this Render build; see render.yaml.');
  }

  return {
    plugins: [react()],
    define: { 'process.env.REACT_APP_API_URL': JSON.stringify(apiUrl) },
    build: { outDir: 'build' },
    // Port 3000 is the origin the backend's CORS list allows.
    server: { host: '0.0.0.0', port: 3000, strictPort: true },
  };
});
