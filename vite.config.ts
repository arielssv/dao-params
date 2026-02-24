import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'

function apiPlugin(): Plugin {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith('/api/')) return next()

        const parsed = new URL(req.url, `http://${req.headers.host}`)
        const route = parsed.pathname.replace('/api/', '')

        try {
          // Dynamic import of the API handler
          const mod = await server.ssrLoadModule(`/api/${route}.ts`)
          const handler = mod.default

          // Build a minimal VercelRequest-like object
          const query: Record<string, string> = {}
          parsed.searchParams.forEach((v, k) => { query[k] = v })

          const vercelReq = Object.assign(req, { query })

          // Build a minimal VercelResponse-like object
          const vercelRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return vercelRes
            },
            json(data: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(data))
              return vercelRes
            },
          })

          await handler(vercelReq, vercelRes)
        } catch (err) {
          console.error(`[api] Error in /api/${route}:`, err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env vars into process.env so API handlers can access them
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [react(), apiPlugin()],
  }
})
