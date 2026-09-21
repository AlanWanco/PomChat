import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import pkg from './package.json'

function getBuildCommit() {
  const configured = process.env.POMCHAT_COMMIT_SHA || process.env.GITHUB_SHA
  if (configured?.trim()) return configured.trim()
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isPagesBuild = process.env.BUILD_TARGET === 'pages'
  const buildCommit = getBuildCommit()

  return {
    base: command === 'serve' ? '/' : (isPagesBuild ? '/PomChat/' : './'),
  plugins: [
    react(), 
    tailwindcss(),
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs'
              }
            }
          }
        }
      },
    ]),
    renderer(),
  ],
    server: {
      fs: {
        strict: false,
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_COMMIT__: JSON.stringify(buildCommit),
    }
  }
})
