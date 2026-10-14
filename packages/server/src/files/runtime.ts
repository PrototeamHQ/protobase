import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { fileColumns, runCleanup, type FileColumn } from './cleanup-runner'
import { storageCleanupSchedule, type CleanupSchedule } from './cleanup-schedule'
import type { Sharp } from './images'
import type { FilesOptions } from './options'
import { resolveProviders, retentionOf } from './providers'
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
}

/** How long an upload ticket stays usable, so a form left open still saves. */
export const ticketSeconds = 24 * 60 * 60

export type FilesRuntimeInput = { options?: FilesOptions; env: Record<string, string | undefined>; models: ResourceModel[]; systemPath: string }

// The image fields that need sharp, as `resource.field`: those with variants, an original or a placeholder.
const imageFields = (models: ResourceModel[]) =>
  models.flatMap((model) =>
    Object.values(model.fields).flatMap(({ name, file }) => (file && (file.variants || file.original || file.placeholder !== undefined) ? [`${model.name}.${name}`] : [])),
  )

/**
 * The runtime, when a resource has a file field or the config names providers. It fails at startup when a field's
 * provider is not configured, nothing signs uploads, or a field makes image variants or placeholders without sharp.
 */
export const createFilesRuntime = ({ options = {}, env, models, systemPath }: FilesRuntimeInput): FilesRuntime | undefined => {
  const used = [...new Set(models.flatMap((model) => Object.values(model.fields).flatMap((field) => (field.file ? [field.file.provider] : []))))]
  if (used.length === 0 && !options.providers) return undefined
  const secret = options.secret ?? env.PROTOBASE_FILES_SECRET ?? env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('File fields need a secret to sign uploads: set BETTER_AUTH_SECRET, PROTOBASE_FILES_SECRET or files.secret')
  const images = imageFields(models)
  if (images.length > 0 && !options.sharp) {
    throw new Error(`${images.join(', ')} make image variants or placeholders, which need sharp: add it to the project (bun add sharp), then import sharp from 'sharp' in the config and pass files: { sharp }`)
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
  }
}

/** Runs the scheduled deletes that are due (see `runCleanup`). */
export const cleanupFiles = (runtime: FilesRuntime, db: Db, now?: Date) =>
  runCleanup({ db, columns: runtime.columns, providers: runtime.providers, schedule: runtime.schedule, ...(now && { now }) })
