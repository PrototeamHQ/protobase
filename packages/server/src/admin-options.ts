import type { ResolveOptions } from '@protobase/schema'
import type { AssistantOptions } from './assistant/assistant-settings'
import type { RuntimeOptions } from './runtime/runtime-settings'
import type { AuditQueue, PipelineHook, ScanGuardMode } from './types'

export type AdminOptions = {
  /** Default `/api/v1`. */
  basePath?: string
  /** Applied to every request's transaction with SET LOCAL. Default 15000. */
  statementTimeoutMs?: number
  /** List shapes that would sequentially scan a table of more than `seqScanRows` rows (default 10000). Default mode `reject`. */
  scanGuard?: { mode?: ScanGuardMode; seqScanRows?: number }
  /** Runs inside the write transaction after each create, update and delete. */
  writeHooks?: PipelineHook[]
  /** The project's roles (from `defineRoles`): an operation without an access rule needs the matching capability. */
  roles?: ResolveOptions['roles']
  /** What an operation without a rule does; overrides the capability check. Without `roles` the default is allow. */
  defaultAccess?: ResolveOptions['defaultAccess']
  /** Whether list items carry their `permissions` (update, delete): true by default, or `{ except: [...] }` for resources that opt out. */
  rowPermissions?: boolean | { except: string[] }
  /** Receives an event for every reveal of a sensitive field. Default: printed to the console, nothing kept. */
  audit?: AuditQueue
  /** Called with every error the API turns into a 500, so the host can report it. */
  onUnhandledError?: (error: unknown) => void
  /** The assistant in the admin app's dock: a backend elsewhere or the built-in one (see `AssistantOptions`); `false` turns it off. */
  assistant?: AssistantOptions | false
  /** The runtime updates endpoint behind the top bar's update button (see `RuntimeOptions`); `false` turns it off. */
  runtime?: RuntimeOptions | false
}
