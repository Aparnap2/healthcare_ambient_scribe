import { serve } from '@hono/node-server'
import app from './api/index'

const port = parseInt(process.env.API_PORT || '3001')

console.log(`API server running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port,
})
