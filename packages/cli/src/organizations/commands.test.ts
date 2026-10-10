import { describe, expect, it, vi } from 'vitest'
import { addAppRoleCommand, addMemberCommand, createOrganizationCommand, listOrganizationsCommand, parseRoleList, setMemberRolesCommand, slugOf, type OrganizationsApi } from './commands'

const api = (): OrganizationsApi => ({
  listOrganizations: async () => [{ id: '1', name: 'Acme', slug: 'acme', members: [{ email: 'bo@example.com', role: 'owner', appRoles: ['manager', 'sales'] }] }],
  createOrganization: vi.fn(async (input) => ({ organization: { id: input.id ?? 'new-id', slug: input.slug } })),
  addMember: vi.fn(async () => undefined),
  setMemberRoles: vi.fn(async () => undefined),
  removeMember: vi.fn(async () => undefined),
  addAppRoleToOwners: vi.fn(async () => 2),
  listUsers: async () => [
    { email: 'bo@example.com', role: 'admin' },
    { email: 'root@example.com', role: 'admin' },
    { email: 'sanne@example.com', role: 'sales,manager' },
    { email: 'kim@example.com', role: 'user' },
  ],
  setUserRole: vi.fn(async () => undefined),
  membershipRoles: () => ['manager', 'sales', 'accountant'],
})

const output = () => {
  const lines: string[] = []
  return { lines, out: (text: string) => void lines.push(text) }
}

describe('the organization commands', () => {
  it('make slugs from names and lists from commas', () => {
    expect(slugOf('Müller & Zonen B.V.')).toBe('muller-zonen-b-v')
    expect(parseRoleList('sales, manager,')).toEqual(['sales', 'manager'])
    expect(parseRoleList('')).toEqual([])
    expect(parseRoleList(undefined)).toBeUndefined()
  })

  it('list organizations with their members', async () => {
    const { lines, out } = output()
    await listOrganizationsCommand(api(), out)
    expect(lines.join('')).toBe('acme  Acme  (1)\n  bo@example.com  owner  manager,sales\n')
  })

  it('create an organization with a slug from its name, keeping a given id', async () => {
    const organizations = api()
    const { lines, out } = output()
    await createOrganizationCommand(organizations, { name: 'Acme Holding', owner: 'bo@example.com', id: '1' }, out)
    expect(organizations.createOrganization).toHaveBeenCalledWith({ name: 'Acme Holding', slug: 'acme-holding', owner: 'bo@example.com', id: '1' })
    expect(organizations.addMember).not.toHaveBeenCalled()
    expect(lines.join('')).toBe('Created organization acme-holding (1), owned by bo@example.com\n')
  })

  it('bring every user in with --members all: superusers as owners, the others with their global roles moved here', async () => {
    const organizations = api()
    const { out } = output()
    await createOrganizationCommand(organizations, { name: 'Acme', owner: 'bo@example.com', id: '1', members: 'all' }, out)
    expect(organizations.addMember).toHaveBeenCalledWith({ organization: '1', email: 'root@example.com', role: 'owner', appRoles: ['manager', 'sales', 'accountant'] })
    expect(organizations.addMember).toHaveBeenCalledWith({ organization: '1', email: 'sanne@example.com', role: 'member', appRoles: ['sales', 'manager'] })
    expect(organizations.addMember).toHaveBeenCalledWith({ organization: '1', email: 'kim@example.com', role: 'member', appRoles: [] })
    expect(organizations.setUserRole).toHaveBeenCalledWith({ email: 'sanne@example.com', role: 'user' })
    expect(organizations.setUserRole).not.toHaveBeenCalledWith(expect.objectContaining({ email: 'root@example.com' }))
    await expect(createOrganizationCommand(organizations, { name: 'Acme', owner: 'bo@example.com', members: 'some' }, out)).rejects.toThrow('--members takes "all"')
  })

  it('add members and change their roles', async () => {
    const organizations = api()
    const { out } = output()
    await addMemberCommand(organizations, { organization: 'acme', email: 'jan@example.com', appRoles: 'accountant' }, out)
    expect(organizations.addMember).toHaveBeenCalledWith({ organization: 'acme', email: 'jan@example.com', appRoles: ['accountant'] })
    await setMemberRolesCommand(organizations, { organization: 'acme', email: 'jan@example.com', orgRole: 'admin' }, out)
    expect(organizations.setMemberRoles).toHaveBeenCalledWith({ organization: 'acme', email: 'jan@example.com', role: 'admin' })
    await expect(setMemberRolesCommand(organizations, { organization: 'acme', email: 'jan@example.com' }, out)).rejects.toThrow('Pass --org-role, --app-roles or both')
  })

  it('give a new app role to every owner', async () => {
    const organizations = api()
    const { lines, out } = output()
    await addAppRoleCommand(organizations, { role: 'accountant', to: 'owners' }, out)
    expect(organizations.addAppRoleToOwners).toHaveBeenCalledWith('accountant')
    expect(lines.join('')).toBe('Gave accountant to 2 owners\n')
    await expect(addAppRoleCommand(organizations, { role: 'accountant', to: 'members' }, out)).rejects.toThrow('--to takes "owners"')
  })
})
