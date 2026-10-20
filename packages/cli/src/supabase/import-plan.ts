import { appExtensions, languageExtensions, sortExtensions, type SourceExtension } from './extensions'
import type { Missing } from './rewrite'
import type { HttpTrigger } from './source-facts'
import { isWebhook } from './webhooks'

/**
 * The schemas of timescaledb's own functions, which a hypertable's insert-blocking trigger calls. The dump restores a
 * hypertable as a plain table, which that trigger would keep empty, so it is always left out.
 */
const timescaleSchemas = ['_timescaledb_functions', '_timescaledb_internal']

/** The extensions to ask the project's database about: the app's, and Vault where the source has it. */
export const probedExtensions = (extensions: SourceExtension[]) => [
  ...appExtensions(extensions).map((extension) => extension.name),
  ...extensions.filter((extension) => extension.name === 'supabase_vault').map((extension) => extension.name),
]

/**
 * What the import carries over to the project's database, given the extensions it said it may create (`creatable`):
 * the extensions the migration creates, and the ones it leaves out; whether Vault's secrets and pgmq's queues are made
 * again; whether Database Webhooks get their shim; and what the dump's rewrite leaves out for want of an extension.
 */
export const importPlan = (source: { extensions: SourceExtension[]; httpTriggers: HttpTrigger[] }, creatable: Set<string>) => {
  const sorted = sortExtensions(appExtensions(source.extensions), creatable)
  const created = (name: string) => sorted.created.some((extension) => extension.name === name)
  const leftOut = (name: string) => sorted.leftOut.some((extension) => extension.name === name)
  const vault = source.extensions.filter((extension) => extension.name === 'supabase_vault' && creatable.has(extension.name))
  const webhooks = created('pg_net') && source.httpTriggers.some(isWebhook)
  const missing: Missing = {
    triggerSchemas: [...(webhooks ? [] : ['supabase_functions']), ...timescaleSchemas],
    languages: languageExtensions.filter(leftOut),
  }
  return {
    extensions: [...sorted.created, ...vault],
    leftOut: sorted.leftOut,
    vault: vault.length > 0,
    queues: created('pgmq'),
    webhooks,
    httpSent: created('pg_net'),
    missing,
  }
}
