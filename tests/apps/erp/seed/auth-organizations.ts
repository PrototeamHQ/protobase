import type { TransactionSql } from 'postgres'
import type { Db } from '../db/connection'

/**
 * Better Auth's rows for the ERP's own organizations, under the same ids, so people work in them once they are members.
 * The first user of a new app becomes the owner of those that have no members yet (`protobase users create`).
 */
export const seedAuthOrganizations = async (sql: Db | TransactionSql, organizations: { id: number; name: string; slug: string }[]) => {
  const rows = organizations.map(({ id, name, slug }) => ({ id: String(id), name, slug, created_at: new Date() }))
  await sql`insert into auth.organization ${sql(rows)} on conflict do nothing`
}
