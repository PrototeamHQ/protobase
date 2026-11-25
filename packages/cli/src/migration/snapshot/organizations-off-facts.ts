import postgres from 'postgres'
import type { DefaultOrganization } from '@protobase/server'
import { keptNames, type StoreNames } from '@protobase/server/internal'

/**
 * What goes dark once organizations are off and the default organization stands in for every one: the people who are
 * no member of it, and the personal access tokens made in another organization or in none. `only` is the store's one
 * organization, when it has exactly one and it is not the default.
 */
export type OrganizationsOffFacts = { outside: number; otherTokens: number; only?: DefaultOrganization }

/** The facts of turning organizations off, read from the database at `url` in a read-only transaction, the tables named as organizations on name them. */
export const organizationsOffFacts = async (url: string, names: StoreNames, defaultId: string): Promise<OrganizationsOffFacts> => {
  const kept = keptNames(names.names)
  const user = kept.table('user')
  const member = kept.table('member')
  const organization = kept.table('organization')
  const { organization_id: memberOrganization, user_id: memberUser } = member.columns
  const { name, slug } = organization.columns
  // Only tokens of a module that is on stop working: one kept while its module is off acts for no one either way.
  const token = names.names.modules.includes('personal_access_tokens') ? kept.table('personal_access_token') : undefined
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    return await sql.begin('read only', async (tx) => {
      const [people] = await tx.unsafe<{ count: number }[]>(`select count(*)::int as count from ${user} as people where not exists (select from ${member} where ${memberOrganization} = $1 and ${memberUser} = people.id)`, [defaultId])
      const [tokens] = token ? await tx.unsafe<{ count: number }[]>(`select count(*)::int as count from ${token} where ${token.columns.organization_id} is distinct from $1`, [defaultId]) : [{ count: 0 }]
      const organizations = await tx.unsafe<DefaultOrganization[]>(`select id::text as id, ${name} as name, ${slug} as slug from ${organization} order by id limit 2`)
      const only = organizations.length === 1 && organizations[0]!.id !== defaultId ? organizations[0] : undefined
      return { outside: people!.count, otherTokens: tokens!.count, ...(only && { only: { id: only.id, name: only.name, slug: only.slug } }) }
    })
  } finally {
    await sql.end()
  }
}
