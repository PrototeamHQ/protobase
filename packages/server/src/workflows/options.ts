import type { LoadedPlugin } from '@protobase/workflows'
import type { TenantValue } from '../types'

/** Workflows made in the admin app (`workflows: {}`), kept with their runs in a schema of the app's database. */
export type WorkflowsOptions = {
  /** The schema of the workflows, their versions, runs and steps; default `workflows`. */
  schema?: string
  /**
   * The environment variables workflows may read, each as `$states.context.Secrets.<NAME>`; no other is reachable.
   * Their values are blanked out of all a run records. Startup stops when one is unset or shorter than 8 characters.
   */
  secrets?: string[]
  /**
   * The roles a workflow's last editor holds now in its tenant, which its records steps act with. Default: read from
   * the project's Better Auth (`auth`); a project that signs people in otherwise passes its own, which the CLI reads
   * from the default export of `workflows/saved-by-roles.ts`.
   */
  savedByRoles?: (user: { id: string; tenant?: TenantValue }) => Promise<string[]>
  /**
   * Lets the `app:http` step reach private, loopback and link-local addresses, for development and tests. Default
   * false: a URL whose host resolves to one fails the step, so a workflow cannot reach the app's own network.
   */
  allowPrivateAddresses?: boolean
  /**
   * The app's workflow plugins, run beside the built-in types (`app:*`) through the same interface; the CLI loads them
   * from `workflows.plugins` and `workflows/plugins/<name>.ts`. Two of one name stop startup, naming both sources.
   */
  plugins?: LoadedPlugin[]
  /**
   * Which runs keep a trace, every step's input, output and logs as JSON lines in the private file provider: `all`
   * (default), `failed` for only the runs that fail, or `none`. A workflow's definition (`trace`) and a run's own
   * `trace` set it for theirs.
   */
  trace?: 'all' | 'failed' | 'none'
  /**
   * Turns on storage configurations, the named places workflows store files in, which authors with the grant create.
   * `root` is the one folder local configurations live inside, such as a mounted file share; without it, authors create
   * only S3-compatible ones. `endpoints` are the `https://` origins an S3-compatible configuration may name; without
   * them, authors create none. S3-compatible ones cannot be used while the server's environment sets an S3 endpoint,
   * region or session token (`S3_*` or `AWS_*`). Encrypted keys need `PROTOBASE_ENCRYPTION_KEY`.
   */
  storage?: { root?: string; endpoints?: string[] }
}

const schemaPattern = /^[a-z_][a-z0-9_]*$/
const secretName = /^[A-Z_][A-Z0-9_]*$/

/** The schema of the options, checked. */
export const workflowsSchema = (options: Pick<WorkflowsOptions, 'schema'> = {}) => {
  const schema = options.schema ?? 'workflows'
  if (!schemaPattern.test(schema)) throw new Error(`Invalid workflows schema "${schema}": use lowercase letters, digits and "_"`)
  // Postgres cuts a longer name to 63 bytes, so two configs could share one schema.
  if (schema.length > 63) throw new Error(`Invalid workflows schema "${schema}": at most 63 characters`)
  return schema
}

/** The secrets workflows may read, by name, from `env`; startup stops on a name that is invalid or unset. */
export const workflowSecrets = (options: WorkflowsOptions, env: Record<string, string | undefined>) =>
  Object.fromEntries(
    (options.secrets ?? []).map((name) => {
      if (!secretName.test(name)) throw new Error(`workflows.secrets: "${name}" is not an environment variable name; use capitals, digits and "_"`)
      const value = env[name]
      if (value === undefined || value === '') throw new Error(`workflows.secrets names ${name}, which is not set`)
      return [name, value]
    }),
  )

const traceModes = ['all', 'failed', 'none']

/** The trace runs keep when neither they nor their workflow says; startup stops on any other value than the three. */
export const workflowsTraceMode = (options: WorkflowsOptions) => {
  const mode = options.trace ?? 'all'
  if (!traceModes.includes(mode)) throw new Error(`workflows.trace is "${String(mode)}": use all, failed or none`)
  return mode
}

/** Whether storage is on: a `storage` object turns it on, and leaving it out, `false` or `null` leaves it off. */
export const workflowsStorageOn = (options: Pick<WorkflowsOptions, 'storage'>) => Boolean(options.storage)

/** The storage options, checked: each endpoint an `https://` origin with no path, user or query, kept as its origin. */
export const workflowsStorage = (options: Pick<WorkflowsOptions, 'storage'>) => {
  if (!options.storage) return undefined
  const { root, endpoints = [] } = options.storage
  if (root !== undefined && (typeof root !== 'string' || root.trim() === '')) throw new Error('workflows.storage.root is a folder path; leave it out for no local storage')
  const origins = endpoints.map((given) => {
    const url = URL.canParse(given) ? new URL(given) : undefined
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
      throw new Error(`workflows.storage.endpoints: "${given}" is not an https:// origin such as https://storage.example.com`)
    }
    return url.origin
  })
  return { ...(root !== undefined && { root }), endpoints: origins }
}

export type WorkflowsStorage = NonNullable<ReturnType<typeof workflowsStorage>>
