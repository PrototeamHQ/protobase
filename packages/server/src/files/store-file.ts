import type { FilesOptions } from './options'
import { resolveProviders } from './providers'

export type StoreFileInput = {
  /** The provider's name, as a stored value starts with it: `public` in `public:listings/house-1.png`. */
  provider: string
  /** The path in the provider, such as `listings/house-1.png`. */
  path: string
  body: Uint8Array | ReadableStream<Uint8Array>
  /** `files` from `protobase.config.ts`, when it configures providers; the environment's apply on top, as for the server. */
  files?: FilesOptions
  /** Where `PROTOBASE_FILES_<NAME>` and the credentials are read from, usually `process.env`. */
  env: Record<string, string | undefined>
}

/**
 * Writes a file into one of the app's providers outside a request, such as from a seed: the folder of a `file:`
 * provider, the bucket of an `s3:` one, resolved as the server resolves them (`PROTOBASE_FILES_<NAME>`, else the
 * config's, else `data/files/<name>` for `private` and `public`). A relative folder is taken from the working directory.
 */
export const storeFile = async ({ provider, path, body, files = {}, env }: StoreFileInput) => {
  const providers = resolveProviders(files, env, [provider])
  const stream = body instanceof ReadableStream ? body : new Blob([body as BlobPart]).stream()
  return providers[provider]!.store.put(path, stream)
}
