import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

try {
  const config = JSON.parse(
    execFileSync('supabase', ['status', '--output', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
  if (!config.API_URL || !config.PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
    throw new Error('Missing local configuration.')
  writeFileSync(
    new URL('../.env.local', import.meta.url),
    `VITE_SUPABASE_URL=${config.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${config.PUBLISHABLE_KEY}\n`,
    { flag: 'wx', mode: 0o600 },
  )
  console.log(
    'Created .env.local using the local project URL and publishable key only.',
  )
} catch {
  console.error(
    'Could not create .env.local. Start Supabase first and ensure .env.local does not already exist.',
  )
  process.exitCode = 1
}
