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
   * the project's Better Auth (`auth`); a project that signs people in otherwise passes its own.
   */
  savedByRoles?: (user: { id: string; tenant?: TenantValue }) => Promise<string[]>
  /**
   * Lets the `app:http` step reach private, loopback and link-local addresses, for development and tests. Default
   * false: a URL whose host resolves to one fails the step, so a workflow cannot reach the app's own network.
   */
  allowPrivateAddresses?: boolean
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
