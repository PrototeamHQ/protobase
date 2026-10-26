import { sql } from 'kysely'
import type { AuthHooks } from '@protobase/server'

// The ERP's records name their organization by core.organizations' integer id, so a new organization takes the next
// value of that table's sequence, and gets its row there with the ERP's own settings once it is made.
export const generateOrganizationId: AuthHooks['generateOrganizationId'] = async ({ db }) => {
  const { rows } = await sql<{ id: string }>`select nextval(pg_get_serial_sequence('core.organizations', 'id'))::text as id`.execute(db)
  return rows[0]!.id
}

export const onOrganizationCreated: AuthHooks['onOrganizationCreated'] = async ({ organization }, { db }) => {
  await sql`insert into core.organizations (id, name, slug, country_code, currency_code) values (${Number(organization.id)}, ${organization.name}, ${organization.slug}, 'NL', 'EUR') on conflict (id) do nothing`.execute(db)
}

export const organizationHooks: AuthHooks['organizationHooks'] = {
  afterUpdateOrganization: async ({ organization }, { db }) => {
    if (organization) await sql`update core.organizations set name = ${organization.name}, slug = ${organization.slug} where id = ${Number(organization.id)}`.execute(db)
  },
}

// Orders name their owner by core.users' integer id, so a new user takes the next value of that table's sequence; their
// row there comes with their first membership (db/migrations/019_auth_users.sql).
export const generateUserId: AuthHooks['generateUserId'] = async ({ db }) => {
  const { rows } = await sql<{ id: string }>`select nextval(pg_get_serial_sequence('core.users', 'id'))::text as id`.execute(db)
  return rows[0]!.id
}
