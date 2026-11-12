import { appReadUrl, filePath, filesPath, storedFileRef } from '@protobase/schema/internal'

/**
 * Where a page reads a stored file's bytes with `fetch` from the API at `systemUrl` (`/api`, or an absolute one), never
 * through a redirect to a bucket that sends no CORS headers. A file that API links under its own files is read through
 * that link; one it links elsewhere, such as a public file at a CDN's `publicUrl`, from its files by the stored `uri`. A
 * link with another scheme, such as `data:`, and a field's external URL are read as they are.
 */
export const fileReadUrl = (file: { uri: string; url: string }, systemUrl: string) => {
  if (!file.url.startsWith('/') && !/^https?:\/\//i.test(file.url)) return file.url
  const ref = storedFileRef(file.uri)
  if (!ref) return file.url
  const files = filesPath(systemUrl)
  if (file.url.startsWith(`${files}/`)) return appReadUrl(file.url)
  return appReadUrl(filePath(files, ref.provider, ref.path))
}
