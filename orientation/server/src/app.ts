import express from 'express'
import cors from 'cors'
import { config } from './lib/config.js'
import { errorHandler } from './lib/http.js'
import workerRouter from './routes/worker.js'
import staffRouter from './routes/staff.js'
import contentRouter from './routes/content.js'
import exportsRouter from './routes/exports.js'
import publicRouter, { externalRouter } from './routes/public.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)),
    })
  )
  app.use(express.json({ limit: '10mb' }))

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'orientation', time: new Date().toISOString() }))
  app.use('/api/w', workerRouter)
  app.use('/api/s/exports', exportsRouter)
  app.use('/api/s', contentRouter)
  app.use('/api/s', staffRouter)
  app.use('/api/v1', externalRouter)
  app.use('/api', publicRouter)

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
  app.use(errorHandler)
  return app
}
