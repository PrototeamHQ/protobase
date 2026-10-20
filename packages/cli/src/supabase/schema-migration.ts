import { createExtensions, type SourceExtension } from './extensions'
import { rewriteSchemaDump } from './rewrite'
import { resetSettings, sessionSettings } from './session-settings'

/**
 * The migration that restores a Supabase database's schemas: the trusted extensions they use, the schema dump as it
 * restores without a superuser, and the session settings the dump changed put back for the migrations after it; and
 * how many of the dump's statements it leaves out.
 */
export const schemaMigration = (dump: string, input: { schemas: string[]; extensions: SourceExtension[] }) => {
  const rewritten = rewriteSchemaDump(dump)
  const text = [
    `-- The schemas ${input.schemas.join(', ')} of a Supabase database, written by \`protobase import supabase\`.\n`,
    "-- Applied with the project's other migrations. Statements naming Supabase's own roles are left out as comments.\n\n",
    createExtensions(input.extensions),
    '\n',
    rewritten.sql,
    '\n',
    resetSettings(sessionSettings(dump)),
  ].join('')
  return { text, leftOut: rewritten.leftOut }
}
