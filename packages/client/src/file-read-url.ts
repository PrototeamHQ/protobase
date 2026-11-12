import { appReadUrl, filePath, filesPath, storedFileRef } from '@protobase/schema/internal'

/**
 * Where a page reads a stored file's bytes with `fetch`: from an API's own origin, never a redirect to a bucket that
 * sends no CORS headers. A file linked at an API's `/files/<provider>/<path>` is read there; one linked elsewhere, such
 * as a public file at a CDN's `publicUrl`, from the files of the API at `systemUrl`. A link with another scheme, such as
 * `data:`, and a field's external URL are read as they are.
 */
export const fileReadUrl = (file: { uri: string; url: string }, systemUrl: string) => {
  if (!file.url.startsWith('/') && !/^https?:\/\//i.test(file.url)) return file.url
  const ref = storedFileRef(file.uri)
  if (!ref) return file.url
  const linked = new URL(file.url, 'http://link.invalid').pathname
  if (linked.endsWith(filePath(filesPath(''), ref.provider, ref.path))) return appReadUrl(file.url)
  return appReadUrl(filePath(filesPath(systemUrl), ref.provider, ref.path))
}
