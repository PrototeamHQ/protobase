/** People's own status, turned on with `status: {}` in `protobase.config.ts`; it needs auth with organizations. */
export type StatusOptions = {
  /** The schema of the statuses table; default `status`. */
  schema?: string
}

const namePattern = /^[a-z_][a-z0-9_]*$/
// Postgres keeps the first 63 bytes of a name.
const maxNameBytes = 63

/** The statuses table's names, checked: a bad schema name is an error naming the option. */
export const statusNames = (options: StatusOptions = {}) => {
  const schema = options.schema ?? 'status'
  if (typeof schema !== 'string' || !namePattern.test(schema) || Buffer.byteLength(schema) > maxNameBytes) {
    throw new Error(`status schema is not a valid name: use lowercase letters, digits and "_", at most ${maxNameBytes} characters`)
  }
  return { schema, table: 'statuses' }
}

export type StatusNames = ReturnType<typeof statusNames>

/** The options, checked as `status` takes them. */
export const checkStatusOptions = (options: StatusOptions) => {
  const unknown = Object.keys(options).find((key) => key !== 'schema')
  if (unknown !== undefined) throw new Error(`status takes no option "${unknown}": only schema`)
  statusNames(options)
  return options
}

/** Status shows people to the members of their organizations, so an app without organizations cannot turn it on. */
export const checkStatusAuth = (auth: { organizations?: unknown } | undefined) => {
  if (!auth?.organizations) throw new Error('status: {} shows people to the members of their organizations: turn organizations on in the auth config, or remove status')
}
