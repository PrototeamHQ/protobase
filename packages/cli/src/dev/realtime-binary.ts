import { createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { realtimeAsset, realtimeDownloadBase, realtimeRelease, type RealtimeRelease } from './realtime-release'
import { userCacheDir } from './user-cache-dir'

export const realtimeBinaryVariable = 'PROTOBASE_REALTIME_BINARY'
export const realtimeDownloadVariable = 'PROTOBASE_REALTIME_DOWNLOAD_URL'

export type RealtimeBinaryOptions = {
  env?: NodeJS.ProcessEnv
  release?: RealtimeRelease
  /** The folder the versions are cached in, `<user cache dir>/protobase/realtime` by default. */
  cacheDir?: string
  platform?: string
  arch?: string
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

// The cached file's bytes; undefined when there is none.
const readCached = async (file: string) => {
  try {
    return await readFile(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
}

// The asset's bytes from `url`, failing with the way around a download that cannot be made.
const download = async (url: string) => {
  const failed = (reason: string) => new Error(`protobase dev could not download Protobase Realtime from ${url} (${reason}): check the connection, or set ${realtimeBinaryVariable} to a binary of your own`)
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    // fetch rejects with a TypeError when the request cannot be made at all, such as without a network.
    if (error instanceof TypeError) throw failed('no connection')
    throw error
  }
  if (!response.ok) throw failed(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * The path of the Protobase Realtime binary protobase dev runs: `PROTOBASE_REALTIME_BINARY` when it is set, unchecked;
 * otherwise the pinned release's asset for this machine from the cache, its sha256 checked on every call, downloaded
 * from the release's tag on first use or when the cached file no longer matches. A download is written to a file of
 * its own, checked, made executable and only then renamed into place, so runs side by side or one cut off never leave
 * a partial binary in the cache.
 */
export const realtimeBinary = async ({ env = process.env, release = realtimeRelease, cacheDir, platform = process.platform, arch = process.arch }: RealtimeBinaryOptions = {}) => {
  const own = env[realtimeBinaryVariable]
  if (own) return path.resolve(own)

  const asset = realtimeAsset(platform, arch)
  const expected = asset && release.sha256[asset]
  if (!asset || !expected) throw new Error(`Protobase Realtime ${release.version} has no build for ${platform}-${arch}: set ${realtimeBinaryVariable} to a binary of your own, or set realtime.relay.url to a running relay`)

  const versionDir = path.join(cacheDir ?? path.join(userCacheDir(env, platform), 'protobase', 'realtime'), release.version)
  const file = path.join(versionDir, asset)
  const cached = await readCached(file)
  if (cached && sha256(cached) === expected) return file
  if (cached) await rm(file, { force: true })

  const url = `${env[realtimeDownloadVariable] || realtimeDownloadBase}/v${release.version}/${asset}`
  const bytes = await download(url)
  const actual = sha256(bytes)
  if (actual !== expected) throw new Error(`Protobase Realtime from ${url} has sha256 ${actual}, not the pinned ${expected}, so protobase dev does not run it`)

  await mkdir(versionDir, { recursive: true })
  const partial = `${file}.${randomBytes(6).toString('hex')}.partial`
  await writeFile(partial, bytes)
  await chmod(partial, 0o755)
  await rename(partial, file)
  return file
}
