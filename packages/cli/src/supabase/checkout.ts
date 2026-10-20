import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

/** The Supabase CLI's files in a checkout: `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`. */
export const checkoutMarkers = (projectDir: string) =>
  ['supabase/config.toml', 'supabase/migrations', 'supabase/functions'].filter((marker) => existsSync(path.join(projectDir, marker)))

/** The Edge Functions in `supabase/functions/`: its folders, except `_shared` and the like. */
export const edgeFunctions = async (projectDir: string) => {
  const dir = path.join(projectDir, 'supabase', 'functions')
  if (!existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.')).map((entry) => entry.name).sort()
}
