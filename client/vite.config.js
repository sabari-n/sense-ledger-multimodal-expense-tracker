import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, path.resolve(__dirname, '..'), ''),
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env
  }

  const currencySymbol = env.VITE_CURRENCY_SYMBOL || env.CURRENCY_SYMBOL || '₹'
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:9088'

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_CURRENCY_SYMBOL': JSON.stringify(currencySymbol),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    }
  }
})
