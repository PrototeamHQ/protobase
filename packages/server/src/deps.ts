import type { PageModel } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { ResolveOptions, UserMenuModel, ViewModel } from '@protobase/schema'
import type { Registry } from './registry'
import type { ScanGuard } from './scan-guard'
import type { AuditQueue, PipelineHook } from './types'

/** Everything a route needs, built once by `createAdmin` and passed down explicitly. */
export type Deps = {
  db: Db
  registry: Registry
  views: ViewModel[]
  userMenu?: UserMenuModel
  pages: PageModel[]
  basePath: string
  /** Where the system endpoints live (`/meta`, `/openapi.json`, `/docs`): the parent of `basePath`, `/api` by default. */
  systemPath: string
  statementTimeoutMs: number
  guard: ScanGuard
  hooks: readonly PipelineHook[]
  accessOptions: ResolveOptions
  /** Where reveals of sensitive fields are published. */
  audit: AuditQueue
  /** Whether list items of a resource carry their permissions. */
  rowPermissions: (resource: string) => boolean
  /** The URL of the assistant backend that `/meta` names to callers who may use it: another origin's, or the built-in one's path. */
  assistant?: string
}
