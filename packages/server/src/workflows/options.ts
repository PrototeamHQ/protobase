/** Workflows made in the admin app (`workflows: {}`), kept with their runs in a schema of the app's database. */
export type WorkflowsOptions = {
  /** The schema of the workflows, their versions, runs and steps; default `workflows`. */
  schema?: string
  /**
   * Lets the `http` step reach private, loopback and link-local addresses, for development and tests. Default false:
   * a URL whose host resolves to one fails the step, so a workflow cannot reach the app's own network.
   */
  allowPrivateAddresses?: boolean
}

const schemaPattern = /^[a-z_][a-z0-9_]*$/

/** The schema of the options, checked. */
export const workflowsSchema = (options: WorkflowsOptions = {}) => {
  const schema = options.schema ?? 'workflows'
  if (!schemaPattern.test(schema)) throw new Error(`Invalid workflows schema "${schema}": use lowercase letters, digits and "_"`)
  return schema
}
