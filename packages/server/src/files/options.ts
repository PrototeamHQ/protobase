import type { Sharp } from './images'
import type { FileProvider } from './store'

/** Where file fields keep their bytes, as the API runs with them: `files` of `protobase.config.ts` with its providers made. Environment variables override it (see `resolveProviders`). */
export type FilesOptions = {
  /**
   * Providers by name. A name is part of every stored value, so name the role (`archive`), not the vendor. Without
   * config, `private` and `public` are folders under `data/files`.
   */
  providers?: Record<string, FileProvider>
  /** How long bytes outlive their last reference, for restores; default `1 day`. Public providers default to 0. */
  retention?: number | string
  /** Signs upload tickets and download URLs; default `PROTOBASE_FILES_SECRET`, then the app's `secret` (`PROTOBASE_SECRET`). */
  secret?: string
  /** The image library that makes the variants and placeholders of image fields: sharp's default export. */
  sharp?: Sharp
  /**
   * Hosts whose images the admin app draws with the page's referrer, besides the app's own and those its providers link
   * public files from: `['images.example.com']`. Images from any other host load with `referrerPolicy="no-referrer"`.
   */
  trustedHosts?: string[]
  /**
   * The app's own media types, each with its extensions, the first being the one its files are stored with:
   * `{ 'application/vnd.example.report+json': ['report.json'] }`. A file uploaded with such an extension, whose bytes
   * are no type the server recognizes, is stored and served as that type, so a viewer the admin app has for it opens it
   * (see `fileViewers` in `definePlugin`). An extension may hold dots; a type or extension built in is refused.
   */
  types?: Record<string, string[]>
  /**
   * Where `supabase.storage` keeps the bytes of its objects, which the app serves at `/api/sb/storage/v1` when it has an API key
   * (see `apiKeys`): `provider` names one of the providers, default `private`, and `maxFileSize` caps every upload, as
   * `50 MB` (the default) or a number of bytes; a bucket's own limit can only be lower. `false` serves no `/api/sb/storage/v1`.
   */
  storage?: { provider?: string; maxFileSize?: number | string } | false
}
