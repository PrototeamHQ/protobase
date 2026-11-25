import type { PinSource } from './pin'

// A project with two organizations, acme pinned by the config: bo is in acme, kim in globex.
const organizations = [
  { id: '1', slug: 'acme', name: 'Acme' },
  { id: '2', slug: 'globex', name: 'Globex' },
]
const members: Record<string, string[]> = { '1': ['bo@example.com'], '2': ['kim@example.com'] }

/** The pin source of that project, `changes` over it, such as `{ organizationsOn: false }`. */
export const pinSourceFixture = (changes: Partial<PinSource> = {}): PinSource => ({
  organizationsOn: true,
  defaultOrganization: organizations[0]!,
  organizationByKey: async (key) => organizations.find((organization) => organization.id === key || organization.slug === key) ?? null,
  isMember: async (organizationId, email) => (members[organizationId] ?? []).includes(email),
  ...changes,
})
