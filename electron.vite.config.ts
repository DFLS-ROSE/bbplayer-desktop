import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * 仅 dev 放宽 CSP：Vite HMR / React-refresh 内联 preamble 需要
 * unsafe-inline / unsafe-eval；connect-src 放开 ws:/http: 供 dev server。
 * prod 构建不生效，保持 index.html 内的严格策略。
 */
const devCspRelaxPlugin: Plugin = {
  name: 'dev-csp-relax',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(
      /http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/,
      (_match, policy: string) => {
        const relaxed = policy
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
          .replace("connect-src 'self' https:", "connect-src 'self' ws: wss: http: https:")
        return `http-equiv="Content-Security-Policy" content="${relaxed}"`
      },
    )
  },
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react(), devCspRelaxPlugin],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          lyrics: resolve('src/renderer/lyrics.html'),
        },
      },
    },
  },
})
