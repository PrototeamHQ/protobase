import type { TransactionSql } from 'postgres'
import type { Db } from '../db/connection'

/**
 * Better Auth's rows for the ERP's own organizations, under the same ids and with their names and slugs, so people work
 * in them once they are members. The first user of a new app becomes the owner of those that have no members yet
 * (`protobase users create`), but not of organization 1, the config's default: `--organization erp --org-role owner` makes them its owner.
 */
export const seedAuthOrganizations = async (sql: Db | TransactionSql, organizations: { id: number; name: string; slug: string }[]) => {
  const rows = organizations.map(({ id, name, slug }) => ({ id: String(id), name, slug, created_at: new Date() }))
  // The default organization the migration made under one of these ids takes the ERP's name and slug for it.
  await sql`insert into auth.organization ${sql(rows)} on conflict (id) do update set name = excluded.name, slug = excluded.slug`
}
