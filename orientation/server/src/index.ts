import { config } from './lib/config.js'
import { createApp } from './app.js'
import { startScheduler } from './lib/scheduler.js'

if (!config.databaseUrl) {
  console.error('[orientation] DATABASE_URL is required (Supabase → Project Settings → Database → connection string)')
  process.exit(1)
}

createApp().listen(config.port, () => {
  console.log(`[orientation] API listening on :${config.port}`)
  if (process.env.ORIENTATION_DISABLE_SCHEDULER !== 'true') startScheduler()
})
