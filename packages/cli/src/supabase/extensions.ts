/** An extension installed in the Supabase database. */
export type SourceExtension = { name: string; schema: string; trusted: boolean }

/**
 * Extensions every Supabase database has for the platform itself (its GraphQL API, Vault, statistics), which an app's
 * schema does not use; pg_cron and pg_net are not among them, since the report lists what uses them.
 */
const platformExtensions = new Set(['plpgsql', 'pg_graphql', 'supabase_vault', 'pgsodium', 'pg_stat_statements'])

/**
 * The app's extensions, by what the import does with them: trusted ones a database owner may create, so the
 * migration creates them in the schema they had; untrusted ones need a superuser, so the report lists them.
 */
export const appExtensions = (extensions: SourceExtension[]) => {
  const app = extensions.filter((extension) => !platformExtensions.has(extension.name))
  return { trusted: app.filter((extension) => extension.trusted), untrusted: app.filter((extension) => !extension.trusted) }
}

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

/** The statements that create `extensions` where the dump expects them. */
export const createExtensions = (extensions: SourceExtension[]) => {
  const schemas = [...new Set(extensions.map((extension) => extension.schema))].filter((schema) => schema !== 'public')
  return [
    ...schemas.map((schema) => `CREATE SCHEMA IF NOT EXISTS ${quoted(schema)};\n`),
    ...extensions.map((extension) => `CREATE EXTENSION IF NOT EXISTS ${quoted(extension.name)} WITH SCHEMA ${quoted(extension.schema)};\n`),
  ].join('')
}
