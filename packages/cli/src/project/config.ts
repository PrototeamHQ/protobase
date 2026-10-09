import type { Db } from '@protobase/query'
import type { AdminAuth, AdminOptions, Authenticator } from '@protobase/server'

// What `protobase.config.ts` may default-export. Everything is optional.
export type ProjectConfig = {
  // The config module, e.g. `import * as config from './config'`; default: ./config/index.ts and ./config/*/ui.ts.
  config?: Record<string, unknown>
  db?: Db
  authenticate?: Authenticator
  // Better Auth instance; createAdmin mounts its routes under /api/auth.
  auth?: AdminAuth
  options?: AdminOptions
}
