import type { ProtobaseConfig } from '@protobase/config'
import { jobDefinitions, type Authenticator, type FunctionSource, type Mailer } from '@protobase/server'
import { mergeConfig } from '../../src/config/merge-config'
import type { ProjectFiles } from '../../src/config/project-files'

type Parts = Omit<ProtobaseConfig, 'jobs'> & {
  /** The resources module, as config/index.ts would export it. */
  config?: Record<string, unknown>
  /** The authenticator, as auth/authenticate.ts would export it. */
  authenticate?: Authenticator
  /** A module of `defineJob`s: each declared in the config, its run in jobs/<name>.ts. */
  jobs?: Record<string, unknown>
  /** The API functions, as ./functions would hold them. */
  functions?: Record<string, FunctionSource>
  /** The app's own mailer, as auth/mailer.ts would export it. */
  mailer?: Mailer
}

/**
 * A merged config as a bundle's reads, from parts the test made: the folder's files hand them back. Sign-in is off
 * unless `auth` turns it on.
 */
export const servedConfig = ({ config = {}, authenticate, jobs = {}, functions = {}, mailer, ...rest }: Parts) => {
  const definitions = jobDefinitions(jobs)
  const modules: Record<string, Record<string, unknown>> = {
    ...(authenticate && { 'auth/authenticate.ts': { default: authenticate } }),
    ...(mailer && { 'auth/mailer.ts': { default: mailer } }),
    ...Object.fromEntries(definitions.map((definition) => [`jobs/${definition.name}.ts`, { default: definition.options.run }])),
  }
  const files: ProjectFiles = {
    resources: async () => config,
    functions: Object.fromEntries(Object.entries(functions).map(([name, source]) => [name, async () => ({ default: source })])),
    module: (file) => (file in modules ? async () => modules[file]! : undefined),
    package: (name) => Promise.reject(new Error(`no package ${name} in a test`)),
  }
  const declared = Object.fromEntries(definitions.map(({ name, options: { name: _, run: __, payload: ___, ...options } }) => [name, options]))
  return mergeConfig({ config: { auth: false, ...rest, jobs: declared }, files, label: 'protobase.config.ts' })
}
