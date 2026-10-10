import { checkedProvider } from '@protobase/schema'
import { parseDuration } from './duration'
import { localFiles } from './local-files'
import type { FilesOptions } from './options'
import type { FileProvider } from './store'

const prefix = 'PROTOBASE_FILES_'
/** `PROTOBASE_FILES_<NAME>` configures a provider, except for these settings. */
export const settingVariables = ['RETENTION', 'SECRET', 'CLEANUP_MINUTES'] as const

const reservedNames = new Set(settingVariables.map((name) => name.toLowerCase().replaceAll('_', '-')))

const checkedName = (name: string) => {
  checkedProvider(name)
  if (reservedNames.has(name)) throw new Error(`"${name}" cannot name a file provider: PROTOBASE_FILES_${name.toUpperCase().replaceAll('-', '_')} is a setting`)
  return name
}

const variableOf = (name: string) => `${prefix}${name.toUpperCase().replaceAll('-', '_')}`

/** A provider from `file:///data/files/private?public=1&public_url=…&retention=14d` (a relative `file:data/files` works too). */
export const providerFromUrl = (text: string, variable: string): FileProvider => {
  let url: URL
  try {
    url = new URL(text)
  } catch (error) {
    if (error instanceof TypeError) throw new Error(`${variable} is not a URL; write it like file:///data/files/private`)
    throw error
  }
  if (url.protocol !== 'file:') throw new Error(`${variable} uses ${url.protocol}; not implemented: only file: providers (local disk) are supported so far`)
  const flag = url.searchParams.get('public')
  const publicUrl = url.searchParams.get('public_url') ?? undefined
  const retention = url.searchParams.get('retention') ?? undefined
  return localFiles({
    dir: decodeURIComponent(url.pathname),
    public: flag === '1' || flag === 'true',
    ...(publicUrl && { publicUrl }),
    ...(retention && { retention }),
  })
}

/**
 * The providers in effect: the config's, each replaced by `PROTOBASE_FILES_<NAME>` when that is set, plus any the
 * environment adds. `private` and `public` default to `data/files/private` and `data/files/public` when `used` needs them.
 */
export const resolveProviders = (options: FilesOptions, env: Record<string, string | undefined>, used: string[]) => {
  const providers: Record<string, FileProvider> = {}
  for (const [name, provider] of Object.entries(options.providers ?? {})) providers[checkedName(name)] = provider
  for (const [variable, value] of Object.entries(env)) {
    if (!variable.startsWith(prefix) || !value) continue
    const suffix = variable.slice(prefix.length)
    if ((settingVariables as readonly string[]).includes(suffix)) continue
    const name = checkedName(suffix.toLowerCase().replaceAll('_', '-'))
    providers[name] = providerFromUrl(value, variable)
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
export const retentionOf = (options: FilesOptions, env: Record<string, string | undefined>) => {
  const fallback = env[`${prefix}RETENTION`] ?? options.retention ?? '1 day'
  const global = parseDuration(fallback, env[`${prefix}RETENTION`] ? `${prefix}RETENTION` : 'files.retention')
  return (provider: FileProvider) => provider.retention ?? (provider.public ? 0 : global)
}
