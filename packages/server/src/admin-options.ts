import type { ResolveOptions, RoleLimit } from '@protobase/schema'
import type { CorsOrigins } from './api-cors'
import type { AssistantOptions } from './assistant/assistant-settings'
import type { ErrorReportingOptions } from './error-reporting/error-reporting-settings'
import type { MapOptions } from './maps/map-settings'
import type { PluginOption } from './plugins/plugin-settings'
import type { RuntimeOptions } from './runtime/runtime-settings'
import type { SourceOption } from './sources/source-settings'
import type { AuditQueue, PipelineHook, ScanGuardMode } from './types'

export type AdminOptions = {
  /** Default `/api/v1`. */
  basePath?: string
  /** Applied to every request's transaction with SET LOCAL. Default 15000. */
  statementTimeoutMs?: number
  /** Reads that filter, sort or count values by a column no index serves. Default mode `reject`. */
  scanGuard?: { mode?: ScanGuardMode }
  /** Runs inside the write transaction after each create, update and delete. */
  writeHooks?: PipelineHook[]
  /**
   * The project's roles (from `defineRoles`): an operation without an access rule needs the matching capability. Their
   * limits are checked against the resources at startup; an `anonymous` role opens the resources API to requests
   * without a token.
   */
  roles?: ResolveOptions['roles'] & { limits?: readonly RoleLimit[] }
  /** What an operation without a rule does; overrides the capability check. Without `roles` the default is allow. */
  defaultAccess?: ResolveOptions['defaultAccess']
  /** Whether list items carry their `permissions` (update, delete): true by default, or `{ except: [...] }` for resources that opt out. */
  rowPermissions?: boolean | { except: string[] }
  /** Receives an event for every reveal of a sensitive field. Default: printed to the console, nothing kept. */
  audit?: AuditQueue
  /** Called with every error the API turns into a 500, and the request it failed, so the host can report it. */
  onUnhandledError?: (error: unknown, request?: Request) => void
  /**
   * Where the app's errors go: the server's 500s and crashes, and the admin app's errors in the browser (see
   * `ErrorReportingOptions`). Defaults to the DSN the platform passes in `PROTOBASE_SENTRY_DSN`; `false` turns it off.
   */
  errorReporting?: ErrorReportingOptions | false
  /** The assistant in the admin app's dock: a backend elsewhere or the built-in one (see `AssistantOptions`); `false` turns it off. */
  assistant?: AssistantOptions | false
  /**
   * The websites whose browser code may call the API (`/api/*` but `/api/auth/*`) besides the app's own origins (see
   * `createAuth`'s `origins`): a list of origins, or `*` for any. Defaults to the one the platform passes in
   * `PROTOBASE_CORS_ORIGINS` (`*` or comma separated), when set. With neither this nor other origins, the API sends no
   * CORS headers.
   */
  cors?: CorsOrigins
  /** The runtime updates endpoint behind the top bar's update button (see `RuntimeOptions`); `false` turns it off. */
  runtime?: RuntimeOptions | false
  /**
   * The map style the record page's maps (`l.map`) are drawn with (see `MapOptions`). Defaults to the one the platform
   * passes in `PROTOBASE_MAP_STYLE_URL`; without either, or with `false`, the app draws no maps.
   */
  maps?: MapOptions | false
  /**
   * The plugins the admin app loads (see `PluginOption`), before the ones the platform lists in `PROTOBASE_PLUGINS`;
   * `false` turns both off.
   */
  plugins?: PluginOption[] | false
  /**
   * Other Protobase APIs whose resources the admin app draws as its own (see `SourceOption`), before the ones the
   * platform lists in `PROTOBASE_SOURCES`; `false` turns both off.
   */
  sources?: SourceOption[] | false
}
