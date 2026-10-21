import type { FilesOptions } from './options'
import { resolveProviders } from './providers'

/** The provider `/api/sb/storage/v1` keeps object bytes in: `files.storage.provider`, default `private`. */
export const storageProviderName = (options: FilesOptions) => (options.storage === false ? undefined : (options.storage?.provider ?? 'private'))

/**
 * The provider `/api/sb/storage/v1` keeps object bytes in, as the app resolves it from the config and the environment, for a
 * command that writes them, such as `protobase import supabase`. Fails when `files.storage` is `false`.
 */
export const storageProvider = (options: FilesOptions, env: Record<string, string | undefined>) => {
  const name = storageProviderName(options)
  if (!name) throw new Error('files.storage is false in protobase.config.ts, so the app keeps no Storage objects')
  return { name, provider: resolveProviders(options, env, [name])[name]! }
}
