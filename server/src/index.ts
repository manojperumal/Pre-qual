import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import invitationsRouter from './routes/invitations.js'
import prequalificationsRouter from './routes/prequalifications.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
)

app.use(express.json({ limit: '1mb' }))

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/invitations', invitationsRouter)
app.use('/api/prequalifications', prequalificationsRouter)

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
