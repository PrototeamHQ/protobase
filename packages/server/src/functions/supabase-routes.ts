import { Hono, type ErrorHandler } from 'hono'
import { cors } from 'hono/cors'
import type { Db } from '@protobase/query'
import type { ApiKeys } from '../api-keys/api-key-settings'
import type { Caller } from '../api-keys/resolve-caller'
import { runInBackground } from '../background-work'
import { notFound, unauthorized } from '../problem'
import { supabaseFunctionsPath } from '../supabase-paths'
import { invokeFunction, type ApiFunction, type KeyFunctionContext } from './define-function'
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
 * The app's functions again at `/api/sb/functions/v1/<name>`, as Supabase serves Edge Functions. A protected function lets in
 * a request its app's keys admit, as Supabase's `verify_jwt` does, and a public one anyone. Either gets the key-made
 * caller, not the app's session, so a function with `roles` is served at `/api/functions/<name>` only. As on Supabase,
 * the function sees the path from its name on, `/<name>/more/parts`, and a CORS preflight, which carries no key,
 * reaches it unchecked.
 */
export const supabaseFunctionRoutes = ({ functions, db, keys, caller, onError }: SupabaseFunctionRoutesInput) => {
  const app = new Hono().basePath(supabaseFunctionsPath)
  app.onError(onError)
  const hasKeys = keys.publishable !== undefined || keys.secret !== undefined

  for (const [name, fn] of Object.entries(functions)) {
    const { options } = fn
    if (options.cors) app.use(`/${name}/*`, cors(options.cors))
    app.all(`/${name}/*`, (c) => runInBackground(async () => {
      if (!options.public && options.roles) throw notFound(`The function "${name}" checks roles, so it is served at /api/functions/${name} only`)
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
