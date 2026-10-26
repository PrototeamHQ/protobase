import type { FilesOptions } from './options'
import { fileProviderOf, type FileProviderSettings } from './provider-settings'
import { resolveProviders } from './providers'
import type { FileProvider } from './store'

/** A provider in `files.providers`: as the config writes it, or made. */
type ProviderEntry = FileProvider | FileProviderSettings | { kind: 'custom' }

export type StoreFileInput = {
  /** The provider's name, as a stored value starts with it: `public` in `public:listings/house-1.png`. */
  provider: string
  /** The path in the provider, such as `listings/house-1.png`. */
  path: string
  body: Uint8Array | ReadableStream<Uint8Array>
  /**
   * `files` from `protobase.config.ts`, when it configures providers, as the config writes it (`{ kind: 'local', dir }`,
   * `{ kind: 's3', bucket }`) or with its providers made; the environment's apply on top, as for the server.
   */
  files?: Omit<FilesOptions, 'providers'> & { providers?: Record<string, ProviderEntry>; images?: string }
  /** Where `PROTOBASE_FILES_<NAME>` and the credentials are read from, usually `process.env`. */
  env: Record<string, string | undefined>
}

// The provider the config gives as data, made; a custom one is the project's own code, which only the script can load.
const providerOf = (name: string, entry: ProviderEntry): FileProvider => {
  if (!('kind' in entry)) return entry
  if (entry.kind === 'custom') throw new Error(`files.providers.${name} is the default export of files/${name}.ts: import it and pass it in place of { kind: 'custom' }`)
  return fileProviderOf(name, entry)
}

/**
 * Writes a file into one of the app's providers outside a request, such as from a seed: the folder of a `file:`
 * provider, the bucket of an `s3:` one, resolved as the server resolves them (`PROTOBASE_FILES_<NAME>`, else the
 * config's, else `data/files/<name>` for `private` and `public`). A relative folder is taken from the working directory.
 */
export const storeFile = async ({ provider, path, body, files = {}, env }: StoreFileInput) => {
  const entry = files.providers?.[provider]
  const providers = resolveProviders(entry ? { providers: { [provider]: providerOf(provider, entry) } } : {}, env, [provider])
  const stream = body instanceof ReadableStream ? body : new Blob([body as BlobPart]).stream()
  return providers[provider]!.store.put(path, stream)
}
