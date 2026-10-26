import type { FilesConfig, ProtobaseConfig } from '@protobase/config'
import type { JobDeclaration } from '@protobase/server'
import type { ProjectFiles } from './project-files'

/** A config, with the folder whose code its conventions find and the name errors give it. */
export type ConfigSource = { config: ProtobaseConfig; files: ProjectFiles; label: string }

/** Where a declared thing's code is found, and the config that declared it. */
export type Found = { files: ProjectFiles; label: string }

/**
 * Several configs as one: the extensions' first, the app's own last. Data is the last config's that sets it; jobs and
 * write hooks keep the folder whose conventions find their code.
 */
export type MergedConfig = Omit<ProtobaseConfig, 'jobs' | 'writeHooks'> & {
  /** Every config's folder, in merge order: their resources and functions all count. */
  sources: Found[]
  /** The folder of the last config that sets `auth`, else the app's own: its auth/hooks.ts and auth/mailer.ts are sign-in's. */
  authFiles?: ProjectFiles
  jobs: Record<string, Found & { declaration: JobDeclaration }>
  /** The write hooks by name, in order. */
  writeHooks: Array<Found & { name: string }>
}

// The objects' keys, each with the last value that is not undefined.
const lastSet = <T extends object>(objects: T[]): T =>
  Object.fromEntries(objects.flatMap((object) => Object.entries(object)).filter(([, value]) => value !== undefined)) as T

/** A name defined by two different values in two configs is an error naming both. */
export const checkUnique = (kind: string, entries: Array<{ name: string; value: unknown; label: string }>) => {
  const seen = new Map<string, { value: unknown; label: string }>()
  for (const { name, value, label } of entries) {
    const first = seen.get(name)
    if (first && first.value !== value) {
      throw new Error(`${kind} "${name}" is defined twice, ${first.label === label ? `in ${label}` : `by ${first.label} and by ${label}`}; rename one of them`)
    }
    if (!first) seen.set(name, { value, label })
  }
}

// Providers are named things: each name once. Trusted hosts add up. Everything else is the last config's that sets it.
const mergedFiles = (sources: ConfigSource[]): FilesConfig | undefined => {
  const all = sources.flatMap(({ config, label }) => (config.files ? [{ files: config.files, label }] : []))
  if (all.length === 0) return undefined
  const providers = all.flatMap(({ files, label }) => Object.entries(files.providers ?? {}).map(([name, value]) => ({ name, value, label })))
  checkUnique('The file provider', providers)
  const trustedHosts = [...new Set(all.flatMap(({ files }) => files.trustedHosts ?? []))]
  const { providers: _, trustedHosts: __, ...rest } = lastSet(all.map(({ files }) => files))
  return {
    ...rest,
    ...(providers.length > 0 && { providers: Object.fromEntries(providers.map(({ name, value }) => [name, value])) }),
    ...(trustedHosts.length > 0 && { trustedHosts }),
  }
}

/**
 * One config from several, the app's own last. Jobs and file providers are named things: one name declared by two
 * configs is an error naming both. Write hooks run in the same order. Every other value is the last config's that sets
 * it, so the app's own wins.
 */
export const mergeConfig = (...sources: ConfigSource[]): MergedConfig => {
  // Every key but the named things, each the last config's that sets it.
  const data = lastSet(sources.map(({ config: { jobs: _, writeHooks: __, files: ___, ...rest } }) => rest))
  const jobs = sources.flatMap(({ config, files, label }) => Object.entries(config.jobs ?? {}).map(([name, declaration]) => ({ name, value: declaration, files, label })))
  checkUnique('The job', jobs)
  const files = mergedFiles(sources)
  const authFiles = (sources.findLast(({ config }) => config.auth) ?? sources.at(-1))?.files
  return {
    ...data,
    ...(files && { files }),
    ...(authFiles && { authFiles }),
    sources: sources.map(({ files, label }) => ({ files, label })),
    jobs: Object.fromEntries(jobs.map(({ name, value, files, label }) => [name, { declaration: value, files, label }])),
    writeHooks: sources.flatMap(({ config, files, label }) => (config.writeHooks ?? []).map((name) => ({ name, files, label }))),
  }
}
