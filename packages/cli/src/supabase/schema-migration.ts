import { createExtensions, type SourceExtension } from './extensions'
import { rewriteSchemaDump, type Missing } from './rewrite'
import { resetSettings, sessionSettings } from './session-settings'
import { webhooksShim } from './webhooks'

export type MigrationInput = {
  schemas: string[]
  /** The extensions to create, which the project's database can. */
  extensions: SourceExtension[]
  /** Whether to create the shim Database Webhooks call, over pg_net among `extensions`. */
  webhooks: boolean
  missing: Missing
}

/**
 * The migration that restores a Supabase database's schemas: the extensions they use that the project's database can
 * create, the Database Webhooks shim where it has pg_net, the schema dump as it restores there without a superuser,
 * and the session settings the dump changed put back for the migrations after it; and how many of the dump's
 * statements it leaves out.
 */
export const schemaMigration = (dump: string, input: MigrationInput) => {
  const rewritten = rewriteSchemaDump(dump, input.missing)
  const text = [
    `-- The schemas ${input.schemas.join(', ')} of a Supabase database, written by \`protobase import supabase\`.\n`,
    "-- Applied with the project's other migrations. Statements naming Supabase's own roles are left out as comments.\n\n",
    createExtensions(input.extensions),
    input.webhooks ? `\n${webhooksShim}` : '',
    '\n',
    rewritten.sql,
    '\n',
    resetSettings(sessionSettings(dump)),
  ].join('')
  return { text, leftOut: rewritten.leftOut }
}
