import { Hono, type ErrorHandler } from 'hono'
import { cors } from 'hono/cors'
import type { Db } from '@protobase/query'
import type { ApiKeys } from '../api-keys/api-key-settings'
import type { Caller } from '../api-keys/resolve-caller'
import { runInBackground } from '../background-work'
import { notFound, unauthorized } from '../problem'
import { supabaseFunctionsPath } from '../supabase-paths'
import { invokeFunction, type ApiFunction, type KeyFunctionContext, type ProtectedFunctionOptions } from './define-function'
import { relativeRequest } from './routes'

export type SupabaseFunctionRoutesInput = {
  functions: Record<string, ApiFunction>
  db: Db
  keys: ApiKeys
  /** The caller of a request's `apikey` header and bearer token (`apiKeyCaller`). */
  caller: (request: Request) => Promise<Caller>
  onError: ErrorHandler
}

/**
 * The functions with `supabase: true` again at `/api/sb/functions/v1/<name>`, as Supabase serves Edge Functions. A
 * protected one lets in a request its app's keys admit, as Supabase's `verify_jwt` does, the publishable key alone
 * included, and a public one anyone. Either gets the key-made caller, not the app's session, so neither may have
 * `roles` or `capability`: that stops startup. As on Supabase, the function sees the path from its name on,
 * `/<name>/more/parts`, and a CORS preflight, which carries no key, reaches it unchecked. Every other function is a 404
 * here, and none of its code runs.
 */
export const supabaseFunctionRoutes = ({ functions, db, keys, caller, onError }: SupabaseFunctionRoutesInput) => {
  const app = new Hono().basePath(supabaseFunctionsPath)
  app.onError(onError)
  const hasKeys = keys.publishable !== undefined || keys.secret !== undefined

  for (const [name, fn] of Object.entries(functions)) {
    const { options } = fn
    if (options.supabase !== true) {
      app.all(`/${name}/*`, () => {
        throw notFound(`The function "${name}" answers at /api/functions/${name} only: give it supabase: true to answer here too`)
      })
      continue
    }
    // Any value counts, `roles: []` and `capability: ''` too, and on a public function forced past the types.
    const { roles, capability } = options as ProtectedFunctionOptions
    const gated = roles !== undefined ? 'roles' : capability !== undefined ? 'a capability' : undefined
    if (gated) throw new Error(`The function "${name}" has supabase: true and ${gated}, which /api/sb/functions/v1 cannot check: drop one`)
    if (options.cors) app.use(`/${name}/*`, cors(options.cors))
    app.all(`/${name}/*`, (c) => runInBackground(async () => {
      const request = relativeRequest(c.req.raw, supabaseFunctionsPath)
      if (options.public || c.req.method === 'OPTIONS') {
        let resolved: Promise<Caller> | undefined
        const context: KeyFunctionContext = { name, db, caller: () => (resolved ??= caller(c.req.raw)) }
        return invokeFunction(name, fn, request, context)
      }
      if (!hasKeys) throw unauthorized('This app has no keys, so only its public functions answer here')
      const resolved = await caller(c.req.raw)
      return invokeFunction(name, fn, request, { name, db, caller: async () => resolved })
    }))
  }
  app.all('/*', (c) => {
    throw notFound(`There is no function at ${c.req.path}`)
  })
  return app
}
