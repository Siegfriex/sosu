import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Build SHA for public verification of what is deployed: <meta name="sosu-build" content="<sha>">.
// Vercel sets VERCEL_GIT_COMMIT_SHA at build time; VITE_BUILD_SHA overrides; 'local' when neither is present.
const BUILD_SHA = (process.env.VITE_BUILD_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'local').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) || 'local'

function buildMeta(): Plugin {
  return {
    name: 'sosu-build-meta',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'sosu-build', content: BUILD_SHA }, injectTo: 'head' }],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildMeta()],
})
