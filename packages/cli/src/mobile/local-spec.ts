import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// A spec npm installs from a folder or a tarball on this machine (npm-package-arg's isFileSpec): `file:`, or a path
// starting with `.`, `/`, `~/` or a drive letter. Windows' `\` and `~\` forms count on every platform, as a spec in
// doubt counts as local: it only costs a fresh copy.
const localSpec = /^(?:file:|[.]|~[/\\]|[/\\]|[a-z]:)/i

/** Whether npm installs the dependency spec `spec` from this machine, copying it, rather than fetching it. */
export const isLocalSpec = (spec: string) => localSpec.test(spec)

const isWindows = process.platform === 'win32'
const filePath = isWindows ? path.win32 : path.posix

// The characters npm-package-arg encodes before it reads a spec as a file URL (its pathToFileURL).
const encoded = new Map([['\0', '%00'], ['\t', '%09'], ['\n', '%0A'], ['\r', '%0D'], [' ', '%20'], ['"', '%22'], ['#', '%23'], ['%', '%25'], ['?', '%3F'], ['[', '%5B'], ['\\', isWindows ? '/' : '%5C'], [']', '%5D'], ['^', '%5E'], ['|', '%7C'], ['~', '%7E']])

/**
 * The folder npm installs the local spec `spec` from, listed in the package.json in `where`: npm-package-arg's
 * fromFile, so a relative path is read against `where` and `~/` against the home folder, as npm reads them.
 */
export const localFolder = (where: string, spec: string, home = homedir()) => {
  let raw = [...spec].map((char) => encoded.get(char) ?? char).join('')
  if (!raw.startsWith('file:')) raw = `file:${raw}`
  if (/^file:\/\/[^/]/.test(raw)) raw = `file:/${raw.slice(5)}`
  if (/^\/{1,3}\.\.?(\/|$)/.test(raw.slice(5))) raw = raw.replace(/^file:\/{1,3}/, 'file:')
  const resolved = new URL(raw, `${pathToFileURL(filePath.resolve(where))}/`)
  const strip = (pathname: string) => (isWindows ? pathname.replace(/^\/+([a-z]:\/)/i, '$1') : pathname)
  const specPath = strip(decodeURIComponent(new URL(raw).pathname))
  const resolvedPath = strip(decodeURIComponent(resolved.pathname))
  if (/^\/~(\/|$)/.test(specPath)) return filePath.resolve(home, specPath.slice(3))
  return filePath.resolve(where, resolvedPath)
}
