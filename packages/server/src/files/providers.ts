import { checkedProvider } from '@protobase/schema/internal'
import { parseDuration } from './duration'
import { localFiles } from './local-files'
import type { FilesOptions } from './options'
import { s3Files } from './s3-files'
import type { FileProvider } from './store'

const prefix = 'PROTOBASE_FILES_'
/** `PROTOBASE_FILES_<NAME>` configures a provider, except for these settings. */
export const settingVariables = ['RETENTION', 'SECRET', 'CLEANUP_MINUTES'] as const

const reservedNames = new Set(settingVariables.map((name) => name.toLowerCase().replaceAll('_', '-')))
// `PROTOBASE_FILES_<NAME>_ACCESS_KEY_ID` and `_SECRET_ACCESS_KEY` are an s3: provider's credentials, never a provider.
const credentialSuffixes = ['_ACCESS_KEY_ID', '_SECRET_ACCESS_KEY']

const checkedName = (name: string) => {
  checkedProvider(name)
  if (reservedNames.has(name)) throw new Error(`"${name}" cannot name a file provider: PROTOBASE_FILES_${name.toUpperCase().replaceAll('-', '_')} is a setting`)
  const suffix = credentialSuffixes.find((ending) => name.endsWith(ending.toLowerCase().replaceAll('_', '-')))
  if (suffix) throw new Error(`"${name}" cannot name a file provider: variables ending in ${suffix} hold credentials`)
  return name
}

const variableOf = (name: string) => `${prefix}${name.toUpperCase().replaceAll('-', '_')}`

type Env = Record<string, string | undefined>

// The provider's own pair, else the one Bun's S3 client reads by default; never part of the URL, which logs may show.
const credentialsOf = (variable: string, env: Env) => {
  for (const owner of [`${variable}_`, 'S3_', 'AWS_']) {
    const accessKeyId = env[`${owner}ACCESS_KEY_ID`]
    const secretAccessKey = env[`${owner}SECRET_ACCESS_KEY`]
    if (!accessKeyId && !secretAccessKey) continue
    if (!accessKeyId || !secretAccessKey) throw new Error(`Set both ${owner}ACCESS_KEY_ID and ${owner}SECRET_ACCESS_KEY, or neither`)
    return { accessKeyId, secretAccessKey }
  }
  throw new Error(`${variable} needs credentials: set ${variable}_ACCESS_KEY_ID and ${variable}_SECRET_ACCESS_KEY`)
}

// What every scheme takes: `public`, `public_url`, `retention`, `max_bytes` and `max_files`.
const sharedOptions = (url: URL, variable: string) => {
  const flag = url.searchParams.get('public')
  const publicUrl = url.searchParams.get('public_url') ?? undefined
  const retention = url.searchParams.get('retention') ?? undefined
  const maxBytes = url.searchParams.get('max_bytes') ?? undefined
  const maxFiles = url.searchParams.get('max_files') ?? undefined
  if (maxFiles !== undefined && !/^\d+$/.test(maxFiles)) throw new Error(`${variable} has max_files=${maxFiles}; write a whole number of files`)
  return {
    public: flag === '1' || flag === 'true',
    ...(publicUrl && { publicUrl }),
    ...(retention && { retention }),
    ...(maxBytes && { maxBytes }),
    ...(maxFiles && { maxFiles: Number(maxFiles) }),
  }
}

/**
 * A provider from a URL: `file:///data/files/private` (a relative `file:data/files` works too) or
 * `s3://<bucket>/<prefix>?endpoint=…&region=…`, both taking `public=1`, `public_url=…`, `retention=14d`,
 * `max_bytes=1GB` and `max_files=20000`. An s3: provider's credentials come from `<variable>_ACCESS_KEY_ID` and
 * `<variable>_SECRET_ACCESS_KEY`, else `S3_…`, else `AWS_…`.
 */
export const providerFromUrl = (text: string, variable: string, env: Env = {}): FileProvider => {
  let url: URL
  try {
    url = new URL(text)
  } catch (error) {
    if (error instanceof TypeError) throw new Error(`${variable} is not a URL; write it like file:///data/files/private`)
    throw error
  }
  if (url.protocol === 'file:') return localFiles({ dir: decodeURIComponent(url.pathname), ...sharedOptions(url, variable) })
  if (url.protocol !== 's3:') throw new Error(`${variable} uses ${url.protocol}; not implemented: only file: (local disk) and s3: (S3-compatible buckets) providers are supported`)
  if (url.username || url.password) throw new Error(`${variable} must not hold credentials; set ${variable}_ACCESS_KEY_ID and ${variable}_SECRET_ACCESS_KEY instead`)
  if (!url.hostname) throw new Error(`${variable} names no bucket; write it like s3://bucket/prefix?endpoint=https://…`)
  const endpoint = url.searchParams.get('endpoint') ?? undefined
  const region = url.searchParams.get('region') ?? undefined
  return s3Files({
    bucket: url.hostname,
    prefix: decodeURIComponent(url.pathname),
    ...(endpoint && { endpoint }),
    ...(region && { region }),
    ...credentialsOf(variable, env),
    ...sharedOptions(url, variable),
  })
}

/**
 * The providers in effect: the config's, each replaced by `PROTOBASE_FILES_<NAME>` when that is set, plus any the
 * environment adds. `private` and `public` default to `data/files/private` and `data/files/public` when `used` needs them.
 */
export const resolveProviders = (options: FilesOptions, env: Env, used: string[]) => {
  const providers: Record<string, FileProvider> = {}
  for (const [name, provider] of Object.entries(options.providers ?? {})) providers[checkedName(name)] = provider
  for (const [variable, value] of Object.entries(env)) {
    if (!variable.startsWith(prefix) || !value) continue
    const suffix = variable.slice(prefix.length)
    if ((settingVariables as readonly string[]).includes(suffix)) continue
    if (credentialSuffixes.some((ending) => suffix.endsWith(ending))) continue
    const name = checkedName(suffix.toLowerCase().replaceAll('_', '-'))
    providers[name] = providerFromUrl(value, variable, env)
  }
  for (const name of used) {
    if (providers[name]) continue
    if (name !== 'private' && name !== 'public') {
      throw new Error(`No file provider "${name}": add it to files.providers in protobase.config.ts or set ${variableOf(name)}`)
    }
    providers[name] = localFiles({ dir: `data/files/${name}`, public: name === 'public' })
  }
  return providers
}

/** How long a provider keeps bytes after their last reference. */
export const retentionOf = (options: FilesOptions, env: Env) => {
  const fallback = env[`${prefix}RETENTION`] ?? options.retention ?? '1 day'
  const global = parseDuration(fallback, env[`${prefix}RETENTION`] ? `${prefix}RETENTION` : 'files.retention')
  return (provider: FileProvider) => provider.retention ?? (provider.public ? 0 : global)
}
