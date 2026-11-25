import postgres from 'postgres'
import type { DefaultOrganization } from '@protobase/server'
import { keptNames, resolveNames, type StoreNames } from '@protobase/server/internal'

/**
 * What goes dark once organizations are off and the default organization stands in for every one: the people who are
 * no member of it, and the personal access tokens made in another organization or in none. `only` is the store's one
 * organization, when it has exactly one and it is not the default.
 */
export type OrganizationsOffFacts = { outside: number; otherTokens: number; only?: DefaultOrganization }

// A table and a column of the store, which print as their quoted names.
type Named = { toString: () => string }

// The tokens made outside the default organization: none without a token table, and every one where they name no organization.
const tokensOutside = async (tx: postgres.TransactionSql, token: Named, organizationId: Named & { name: string }, defaultId: string) => {
  const [found] = await tx.unsafe<{ table: boolean; column: boolean }[]>(
    `select to_regclass($1) is not null as table, exists (select from pg_catalog.pg_attribute where attrelid = to_regclass($1) and attname = $2 and not attisdropped) as column`,
    [String(token), organizationId.name],
  )
  if (!found!.table) return 0
  const where = found!.column ? ` where ${organizationId} is distinct from $1` : ''
  const [tokens] = await tx.unsafe<{ count: number }[]>(`select count(*)::int as count from ${token}${where}`, found!.column ? [defaultId] : [])
  return tokens!.count
}

/** The facts of turning organizations off, read from the database at `url` in a read-only transaction, the tables named as organizations on name them. */
export const organizationsOffFacts = async (url: string, names: StoreNames, defaultId: string): Promise<OrganizationsOffFacts> => {
  const kept = keptNames(names.names)
  const user = kept.table('user')
  const member = kept.table('member')
  const organization = kept.table('organization')
  const { organization_id: memberOrganization, user_id: memberUser } = member.columns
  const { name, slug } = organization.columns
  // The token table as every module on names it: the database says whether the store has it, kept while its module
  // is off too, and whether its tokens name an organization.
  const { schema, tables } = names.names.input
  const token = resolveNames({ schema, tables }).table('personal_access_token')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    return await sql.begin('read only', async (tx) => {
      const [people] = await tx.unsafe<{ count: number }[]>(`select count(*)::int as count from ${user} as people where not exists (select from ${member} where ${memberOrganization} = $1 and ${memberUser} = people.id)`, [defaultId])
      const otherTokens = await tokensOutside(tx, token, token.columns.organization_id, defaultId)
      const organizations = await tx.unsafe<DefaultOrganization[]>(`select id::text as id, ${name} as name, ${slug} as slug from ${organization} order by id limit 2`)
      const only = organizations.length === 1 && organizations[0]!.id !== defaultId ? organizations[0] : undefined
      return { outside: people!.count, otherTokens, ...(only && { only: { id: only.id, name: only.name, slug: only.slug } }) }
    })
  } finally {
    await sql.end()
  }
}
