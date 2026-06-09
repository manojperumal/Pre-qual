import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import invitationsRouter from './routes/invitations.js'
import prequalificationsRouter from './routes/prequalifications.js'
import questionnairesRouter from './routes/questionnaires.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001

// ─── Middleware ──────────────────────────────────────────────────────────────

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  // Allow any Vercel deployment for this project
  /^https:\/\/pre-qual[a-zA-Z0-9\-]*\.vercel\.app$/,
  // Allow explicit CLIENT_URL if set
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
]

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (Postman, Railway health checks, etc.)
      if (!origin) return callback(null, true)
      const allowed = allowedOrigins.some((o) =>
        typeof o === 'string' ? o === origin : o.test(origin)
      )
      if (allowed) return callback(null, true)
      callback(new Error(`CORS: origin ${origin} not allowed`))
    },
    credentials: true,
  })
)

app.use(express.json({ limit: '50mb' }))

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/invitations', invitationsRouter)
app.use('/api/prequalifications', prequalificationsRouter)
app.use('/api/questionnaires', questionnairesRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[server] Unhandled error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
)

// ─── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] PreQual Pro API listening on port ${PORT}`)
})

export default app
