/** One stored object. */
export type StoredObject = { path: string; size: number; modified: Date }

/**
 * Where a provider keeps bytes: a folder on local disk or an S3-compatible bucket. Paths are relative and use `/`. Every
 * operation on a path that does not exist is harmless: `head` and `read` give `undefined`, `delete` does nothing.
 */
export type FileStore = {
  /** Writes the whole stream, or nothing when it fails: a reader never sees part of an object. */
  put(path: string, body: ReadableStream<Uint8Array>): Promise<{ size: number }>
  head(path: string): Promise<StoredObject | undefined>
  /** The bytes, or the inclusive byte range `start`–`end`. */
  read(path: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array> | undefined>
  delete(path: string): Promise<void>
  /** Every object under `prefix` (a folder such as `.cleanup/`, or `''` for all), sorted by path. */
  list(prefix: string): Promise<StoredObject[]>
  /**
   * A link that serves the bytes straight from storage until `expires` (seconds since the epoch), as `type` with the
   * given Content-Disposition. Downloads redirect to it after their checks; without it the app serves the bytes itself.
   */
  downloadUrl?(path: string, options: { expires: number; type: string; disposition: string }): Promise<string>
}

/** A configured provider: its store, whether its files are public, and how long bytes outlive their last reference. */
export type FileProvider = {
  store: FileStore
  /** Served to anyone at a permanent URL. */
  public: boolean
  /** Where public files are linked from, such as a CDN; default the app's own `/api/files/<provider>`. */
  publicUrl?: string
  /** Milliseconds between a file leaving its row and its bytes being deleted; default `files.retention` (0 when public). */
  retention?: number
  /** The most bytes its store takes (see `limitedFileStore`); unset for no limit. */
  maxBytes?: number
}
