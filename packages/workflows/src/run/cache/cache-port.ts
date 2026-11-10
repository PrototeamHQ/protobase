import type { KeyShape } from './cache-key'
import type { SecretNamer } from './secret-names'

/**
 * Who a cached result was made as, beside the run's tenant, which every entry is kept under: the account the run's
 * version binds to the type's `connection` (`<plugin>:<name>`), or with `bindings` every account it binds, as a Block's
 * steps may sign in with any; the person who saved it (`saver`, as records act), and the person who turned it on
 * (`enabler`, as the mailbox sends). The store reads them from the run, never from the step.
 */
export type CacheIdentity = { connection?: string; bindings?: boolean; saver: boolean; enabler: boolean }

/** An earlier result a store found, with the secrets whose value changed since it was kept, by name. */
export type CacheEntry = { output: unknown; cachedAt: Date; expiresAt: Date; secretsChanged: string[] }

export type CacheCall = { runId: string; type: string; identity: CacheIdentity }

/** Where step results are kept for later calls of the same step type, from any run or workflow. */
export type StepCacheStore = {
  /** The key shapes the type's entries were kept under. */
  shapes(type: string): Promise<KeyShape[]>
  /** The newest entry that has not expired under one of `keys`, made under the run's identity. */
  lookup(call: CacheCall & { keys: string[] }): Promise<CacheEntry | undefined>
  /** Keeps a result for `seconds`; `secrets` names the secrets its key held, whose values the store fingerprints. */
  write(call: CacheCall & { key: string; shape: KeyShape; output: unknown; seconds: number; secrets: string[] }): Promise<void>
}

/** What a step type's handler gets of the cache: the Task's `Cache`, the store, and what keys and kept results need. */
export type TaskCache = {
  setting: boolean | undefined
  store: StepCacheStore
  nameSecrets: SecretNamer
  /** The value with the app's secrets blanked out, as the step's record keeps it. */
  redact: <T>(value: T) => T
}
