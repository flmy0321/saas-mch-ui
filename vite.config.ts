import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 仅开发服务器使用：把同源 /api 转发到后台，使匿名挑战 Cookie 与页面同源。不进入前端产物
  const proxyTarget = env.PORTAL_DEV_PROXY_TARGET

  if (env.VITE_API_MODE === 'http' && mode === 'development' && !proxyTarget) {
    throw new Error('VITE_API_MODE=http 时须设置 PORTAL_DEV_PROXY_TARGET（如 http://127.0.0.1:8080）以同源代理 /api')
  }

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              // 保留浏览器的 Host，后台据此判断来源；Cookie 原样透传，不改写名称/值
              changeOrigin: false,
              // 后台若设置 Domain 属性则去掉，使 Cookie 落在当前开发源上
              cookieDomainRewrite: '',
            },
          }
        : undefined,
    },
  }
})
