import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';
import tailwindcss from '@tailwindcss/postcss';
export default defineConfig({
  environments: {
    rsc: {
      resolve: { noExternal: ['tailwindcss', 'tw-animate-css', 'shadcn'] },
    },
    ssr: {
      resolve: { noExternal: ['tailwindcss', 'tw-animate-css', 'shadcn'] },
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    {
      name: 'vercel-runtime-overrides',
      enforce: 'post',
      config() {
        return {
          resolve: {
            alias: [
              {
                find: '#dashboard-runtime',
                replacement: normalizePath(
                  fileURLToPath(
                    new URL('./lib/platform/vercel.ts', import.meta.url),
                  ),
                ),
              },
              {
                find: '#dashboard-auth',
                replacement: normalizePath(
                  fileURLToPath(
                    new URL('./lib/platform/vercel-auth.ts', import.meta.url),
                  ),
                ),
              },
            ],
          },
        };
      },
    },
    vinext(),
    nitro({
      preset: 'vercel',
      vercel: { functions: { runtime: 'nodejs24.x' } },
    }),
  ],
});
