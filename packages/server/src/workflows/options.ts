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
   * Which runs keep a trace, every step's input, output and logs as JSON lines in the private file provider: `all`
   * (default), `failed` for only the runs that fail, or `none`. A workflow's definition (`trace`) and a run's own
   * `trace` set it for theirs.
   */
  trace?: 'all' | 'failed' | 'none'
  /**
   * A local folder, such as a scratch disk, that keeps copies of runs' large files and values, at most `maxSize` (default
   * `1 GB`), read before the private file provider. A copy may be gone, as the provider's is what a run relies on.
   */
  scratch?: { dir: string; maxSize?: string }
}

const schemaPattern = /^[a-z_][a-z0-9_]*$/
const secretName = /^[A-Z_][A-Z0-9_]*$/

/** The schema of the options, checked. */
export const workflowsSchema = (options: WorkflowsOptions = {}) => {
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
