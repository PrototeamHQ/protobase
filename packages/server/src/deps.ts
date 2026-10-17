import type { PageModel } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { BottomBarModel, ResolveOptions, UserMenuModel, ViewModel } from '@protobase/schema'
import type { ErrorReportingSettings } from './error-reporting/error-reporting-settings'
import type { FilesRuntime } from './files/runtime'
import type { MapSettings } from './maps/map-settings'
import type { PluginOption } from './plugins/plugin-settings'
import type { Registry } from './registry'
import type { SourceOption } from './sources/source-settings'
import type { ScanGuard } from './scan-guard'
import type { AuditQueue, PipelineHook } from './types'

/** Everything a route needs, built once by `createAdmin` and passed down explicitly. */
export type Deps = {
  db: Db
  registry: Registry
  views: ViewModel[]
  userMenu?: UserMenuModel
  /** The bottom bars, in config order. */
  bottomBars: BottomBarModel[]
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
  /** The URL of the runtime updates endpoint that `/meta` names to admins. */
  runtime?: string
  /** Where the admin app sends its errors, which `/meta` names to everyone. */
  errorReporting?: ErrorReportingSettings
  /** The map style the admin app draws maps with and the layers they may switch to, which `/meta` names to everyone. */
  maps?: MapSettings
  /** The plugins `/meta` names to the callers they are for. */
  plugins: PluginOption[]
  /** The other APIs whose resources `/meta` names to the callers they are for. */
  sources: SourceOption[]
  /** Providers, signing and scheduled deletes, when a resource has a file field. */
  files?: FilesRuntime
  /** The transaction setting that tells the change capture who writes, when a resource has events or history (`changes.actor`). */
  actorSetting?: string
  /** Where record history is kept, when a resource has `.history()`, and the names of the users who made changes. */
  history?: { schema: string; actorNames?: (ids: readonly string[]) => Promise<Record<string, string>> }
}
