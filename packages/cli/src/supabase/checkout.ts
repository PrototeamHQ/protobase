import { existsSync } from 'node:fs'
import path from 'node:path'

/** The Supabase CLI's files in a checkout: `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`. */
export const checkoutMarkers = (projectDir: string) =>
  ['supabase/config.toml', 'supabase/migrations', 'supabase/functions'].filter((marker) => existsSync(path.join(projectDir, marker)))

