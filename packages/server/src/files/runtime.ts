import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { parseSize } from '@protobase/schema/internal'
import { fileColumns, runCleanup, type FileColumn } from './cleanup-runner'
import { storageCleanupSchedule, type CleanupSchedule } from './cleanup-schedule'
import type { Sharp } from './images'
import type { FilesOptions } from './options'
import { resolveProviders, retentionOf } from './providers'
import { storageProviderName } from './storage-provider'
import { createSigner, type Signer } from './signer'
import type { FileProvider } from './store'
import { trustedImageHosts } from './trusted-hosts'

/** Everything the API needs to handle files, built once at startup. */
export type FilesRuntime = {
  providers: Record<string, FileProvider>
  signer: Signer
  schedule: CleanupSchedule
  /** Milliseconds a provider keeps bytes after their last reference. */
  retention: (provider: string) => number
  /** The path downloads are served under: `<systemPath>/files`. */
  path: string
  columns: FileColumn[]
  /** Makes image variants and placeholders; set when a field declares them. */
  sharp?: Sharp
  /** The hosts whose images are drawn with the page's referrer, besides the app's own (see `trustedImageHosts`). */
  trustedHosts: string[]
  /** The provider `/api/sb/storage/v1` keeps object bytes in and the largest object it takes, when the app serves it. */
  storage?: { provider: string; maxBytes: number }
}

/** How long an upload ticket stays usable, so a form left open still saves. */
export const ticketSeconds = 24 * 60 * 60

export type FilesRuntimeInput = {
  options?: FilesOptions
  env: Record<string, string | undefined>
  /** The app's secret (`secret`), which signs uploads unless `files.secret` or `PROTOBASE_FILES_SECRET` names another. */
  secret?: string
  models: ResourceModel[]
  systemPath: string
  /** Whether the app serves `/api/sb/storage/v1`, which it does when it has an API key, unless `files.storage` is `false`. */
  storage?: boolean
}

// The image fields that need sharp, as `resource.field`: those with variants, an original or a placeholder.
const imageFields = (models: ResourceModel[]) =>
  models.flatMap((model) =>
    Object.values(model.fields).flatMap(({ name, file }) => (file && (file.variants || file.original || file.placeholder !== undefined) ? [`${model.name}.${name}`] : [])),
  )

/**
 * The runtime, when a resource has a file field, the config names providers or the app serves `/api/sb/storage/v1`. It fails at startup when a field's
 * provider is not configured, nothing signs uploads, or a field makes image variants or placeholders without sharp.
 */
export const createFilesRuntime = ({ options = {}, env, secret: appSecret, models, systemPath, storage: servesStorage = false }: FilesRuntimeInput): FilesRuntime | undefined => {
  const storageName = servesStorage ? storageProviderName(options) : undefined
  const storage = storageName && options.storage !== false ? { provider: storageName, maxBytes: parseSize(options.storage?.maxFileSize ?? '50 MB') } : undefined
  const fieldProviders = models.flatMap((model) => Object.values(model.fields).flatMap((field) => (field.file ? [field.file.provider] : [])))
  const used = [...new Set([...fieldProviders, ...(storage ? [storage.provider] : [])])]
  if (used.length === 0 && !options.providers) return undefined
  const secret = options.secret ?? env.PROTOBASE_FILES_SECRET ?? appSecret ?? env.PROTOBASE_SECRET
  if (!secret) throw new Error('File fields and /api/sb/storage/v1 need a secret to sign uploads: set secret in protobase.config.ts, files.secret or PROTOBASE_FILES_SECRET')
  const images = imageFields(models)
  if (images.length > 0 && !options.sharp) {
    throw new Error(`${images.join(', ')} make image variants or placeholders, which need sharp: add it to the project (bun add sharp), then give the config files: { sharp: () => import('sharp') }`)
  }
  const providers = resolveProviders(options, env, used)
  const retention = retentionOf(options, env)
  return {
    providers,
    signer: createSigner(secret),
    schedule: storageCleanupSchedule(providers),
    retention: (provider) => retention(providers[provider]!),
    path: `${systemPath}/files`,
    columns: fileColumns(models),
    trustedHosts: trustedImageHosts(providers, options.trustedHosts),
    ...(options.sharp && { sharp: options.sharp }),
    ...(storage && { storage }),
  }
}

/** Runs the scheduled deletes that are due (see `runCleanup`). */
export const cleanupFiles = (runtime: FilesRuntime, db: Db, now?: Date) =>
  runCleanup({ db, columns: runtime.columns, providers: runtime.providers, schedule: runtime.schedule, ...(now && { now }) })
