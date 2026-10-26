import { localFiles, type LocalFilesOptions } from './local-files'
import { s3Files, type S3FilesOptions } from './s3-files'
import type { FileProvider } from './store'

/**
 * A built-in file provider in `files.providers`, as data: `{ kind: 'local', dir }`, a folder on local disk, or
 * `{ kind: 's3', bucket }`, an S3-compatible bucket. The provider is made when the app serves.
 */
export type FileProviderSettings = ({ kind: 'local' } & LocalFilesOptions) | ({ kind: 's3' } & S3FilesOptions)

/** The provider the settings describe. */
export const fileProviderOf = (name: string, settings: FileProviderSettings): FileProvider => {
  if (settings.kind === 'local') {
    const { kind: _, ...options } = settings
    return localFiles(options)
  }
  if (settings.kind === 's3') {
    const { kind: _, ...options } = settings
    return s3Files(options)
  }
  throw new Error(`files.providers.${name}: kind is "local", "s3" or "custom", whose provider is the default export of files/${name}.ts`)
}
