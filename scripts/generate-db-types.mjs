import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Buffer before replacing the tracked file; a failed CLI call cannot erase types.
const types = execFileSync(
  'supabase',
  ['gen', 'types', '--local', '--lang', 'typescript', '--schema', 'public'],
  { encoding: 'utf8' },
)
if (!types.includes('export type Database'))
  throw new Error('Database type generation returned no schema.')
writeFileSync(new URL('../src/types/database.ts', import.meta.url), types)
