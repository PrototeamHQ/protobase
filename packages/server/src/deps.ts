import type { PageModel } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { BottomBarModel, ResolveOptions, UserMenuModel, ViewModel } from '@protobase/schema'
import type { Locale } from '@protobase/schema/internal'
import type { ErrorReportingSettings } from './error-reporting/error-reporting-settings'
import type { CommentUsers } from './comments/comment-users'
import type { mentionJob } from './comments/mention-job'
import type { ModelSettings } from './assistant/chat-completions'
import type { EncryptionRuntime } from './encryption/runtime'
import type { FilesRuntime } from './files/runtime'
import type { MapSettings } from './maps/map-settings'
import type { PluginOption } from './plugins/plugin-settings'
import type { Registry } from './registry'
import type { SourceOption } from './sources/source-settings'
import type { ScanGuard } from './scan-guard'
import type { AuditQueue, PipelineHook, WriteCheck } from './types'

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
  /** Run on a create's or update's body before its transaction opens (see `WriteCheck`). */
  writeChecks: readonly WriteCheck[]
  accessOptions: ResolveOptions
  /** Where reveals of sensitive fields are published. */
  audit: AuditQueue
  /** Gets the errors of work that runs after a request's response is decided, such as a committed write's file cleanup. */
  report: (error: unknown) => void
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
  /** The VAPID public key browsers subscribe for Web Push with, when notifications have a web sender, which `/meta` names to everyone. */
  webPushKey?: string
  /** The language the admin app's screens are in for everyone, which `/meta` names to everyone. */
  locale?: Locale
  /** The plugins `/meta` names to the callers they are for. */
  plugins: PluginOption[]
  /** The other APIs whose resources `/meta` names to the callers they are for. */
  sources: SourceOption[]
  /** Providers, signing and scheduled deletes, when a resource has a file field. */
  files?: FilesRuntime
  /** The keys encrypted fields are sealed and revealed with, when a resource has one. */
  encryption?: EncryptionRuntime
  /** The transaction setting that tells the change capture who writes, when a resource has events or history (`changes.actor`). */
  actorSetting?: string
  /** Where record history is kept, when a resource has `.history()`, and the names of the users who made changes. */
  history?: { schema: string; actorNames?: (ids: readonly string[]) => Promise<Record<string, string>> }
  /**
   * When a resource has `.comments()`: with the project's auth, its users and the job that mails a mention; and the
   * origin of the app for a request's URL, which the mailed links go to.
   */
  comments?: { users?: CommentUsers; mentionJob?: ReturnType<typeof mentionJob>; appOrigin: (requestURL: string) => string }
  /**
   * When a resource has an AI field or a view an AI action: the model they call (none without a key), and where a model
   * that fails an action is reported.
   */
  ai?: { model?: ModelSettings; report?: (error: unknown) => void }
}
