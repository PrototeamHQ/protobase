import type { FileProvider } from './store'

/** `files` in `protobase.config.ts`. Environment variables override it (see `resolveProviders`). */
export type FilesOptions = {
  /**
   * Providers by name, such as `private: localFiles({ dir: './data/files' })`. A name is part of every stored value, so
   * name the role (`archive`), not the vendor. Without config, `private` and `public` are folders under `data/files`.
   */
  providers?: Record<string, FileProvider>
  /** How long bytes outlive their last reference, for restores; default `1 day`. Public providers default to 0. */
  retention?: number | string
  /** Signs upload tickets and download URLs; default `PROTOBASE_FILES_SECRET`, then `BETTER_AUTH_SECRET`. */
  secret?: string
}
