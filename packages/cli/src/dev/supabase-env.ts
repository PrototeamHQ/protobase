import { goTruePath, supabasePath, type ApiKeys } from '@protobase/server'

export type SupabaseEnvInput = {
  /** The app's origin, such as `http://localhost:5173`. */
  url: string
  databaseUrl: string
  keys: ApiKeys
  /** Whether the app serves `/api/sb/auth/v1`, whose key set verifies its users' tokens. */
  withAuth: boolean
}

/**
 * The variables Supabase gives its Edge Functions, from the app's own URL, database and keys, so `@supabase/server`
 * and supabase-js inside a function call this app. A key the app lacks leaves its variables out.
 */
export const supabaseEnv = ({ url, databaseUrl, keys, withAuth }: SupabaseEnvInput): Record<string, string> => ({
  SUPABASE_URL: `${url}${supabasePath}`,
  SUPABASE_DB_URL: databaseUrl,
  ...(withAuth && { SUPABASE_JWKS_URL: `${url}${goTruePath}/.well-known/jwks.json` }),
  ...(keys.publishable && {
    SUPABASE_ANON_KEY: keys.publishable,
    SUPABASE_PUBLISHABLE_KEY: keys.publishable,
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: keys.publishable }),
  }),
  ...(keys.secret && {
    SUPABASE_SERVICE_ROLE_KEY: keys.secret,
    SUPABASE_SECRET_KEY: keys.secret,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: keys.secret }),
  }),
})

/** Sets each of `values` that `env` lacks: a variable the developer set, such as in .env, wins. */
export const setMissing = (env: Record<string, string | undefined>, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) env[name] ??= value
}
