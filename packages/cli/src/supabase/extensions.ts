/** An extension installed in the Supabase database. */
export type SourceExtension = { name: string; schema: string }

/**
 * Extensions every Supabase database has for the platform itself (its GraphQL API, Vault, statistics), which an app's
 * schema does not use; pg_cron and pg_net are not among them, since the report lists what uses them. Vault comes over
 * apart, with the secrets it holds.
 */
const platformExtensions = new Set(['plpgsql', 'pg_graphql', 'supabase_vault', 'pgsodium', 'pg_stat_statements'])

export const appExtensions = (extensions: SourceExtension[]) => extensions.filter((extension) => !platformExtensions.has(extension.name))

/** Extensions that are a language of the same name, which Supabase dropped after Postgres 15: its functions need converting. */
export const languageExtensions = ['plv8', 'plls', 'plcoffee']

/**
 * The app's extensions, by what the import does with them: those the project's database can create (`creatable`, as
 * it answered), the migration creates in the schema they had; the report lists the others.
 */
export const sortExtensions = (extensions: SourceExtension[], creatable: Set<string>) => ({
  created: extensions.filter((extension) => creatable.has(extension.name)),
  leftOut: extensions.filter((extension) => !creatable.has(extension.name)),
})

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

/** The statements that create `extensions` where the dump expects them. */
export const createExtensions = (extensions: SourceExtension[]) => {
  const schemas = [...new Set(extensions.map((extension) => extension.schema))].filter((schema) => schema !== 'public' && schema !== 'pg_catalog')
  return [
    ...schemas.map((schema) => `CREATE SCHEMA IF NOT EXISTS ${quoted(schema)};\n`),
    ...extensions.map((extension) => `CREATE EXTENSION IF NOT EXISTS ${quoted(extension.name)} WITH SCHEMA ${quoted(extension.schema)};\n`),
  ].join('')
}
