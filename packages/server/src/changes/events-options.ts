/** Where captured changes live in the app's database (`events` in `protobase.config.ts`). */
export type EventsOptions = {
  /**
   * The schema holding the outbox and the capture function, and the prefix of their transaction settings
   * (`changes.actor`, `changes.capture`); default `changes`. Rename it when the database already has a schema by that name.
   */
  schema?: string
}

const schemaPattern = /^[a-z_][a-z0-9_]*$/

/** The schema of the options, checked: it also prefixes setting names, which take plain lowercase names only. */
export const changesSchema = (options: EventsOptions = {}) => {
  const schema = options.schema ?? 'changes'
  if (!schemaPattern.test(schema)) throw new Error(`Invalid events schema "${schema}": use lowercase letters, digits and "_"`)
  return schema
}
