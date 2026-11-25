import { describe, expect, it, vi } from 'vitest'
import { addAppRoleCommand, addMemberCommand, createOrganizationCommand, listOrganizationsCommand, parseRoleList, removeMemberCommand, setMemberRolesCommand, slugOf, type OrganizationsApi } from './commands'
import { pinSourceFixture } from './pin-source-fixture'

const acme = { id: '1', name: 'Acme', slug: 'acme', members: [{ email: 'bo@example.com', role: 'owner', appRoles: ['manager', 'sales'] }] }
const globex = { id: '2', name: 'Globex', slug: 'globex', members: [] }

const api = (): OrganizationsApi => ({
  ...pinSourceFixture(),
  // One organization's page, or every organization in two pages.
  listOrganizations: vi.fn(async (scope, after) => {
    if (scope === '1') return { organizations: [acme] }
    if (scope === '2') return { organizations: [globex] }
    return after ? { organizations: [globex] } : { organizations: [acme], next: { createdAt: '2026-08-01 00:00:00+00', id: '1' } }
  }),
  createOrganization: vi.fn(async (input) => ({ organization: { id: input.id ?? 'new-id', slug: input.slug } })),
  addMember: vi.fn(async () => undefined),
  setMemberRoles: vi.fn(async () => undefined),
  removeMember: vi.fn(async () => undefined),
  addAppRoleToOwners: vi.fn(async () => 2),
  addEveryUser: vi.fn(async () => [
    { email: 'root@example.com', role: 'owner', appRoles: ['manager', 'sales', 'accountant'] },
    { email: 'sanne@example.com', role: 'member', appRoles: ['sales', 'manager'] },
    { email: 'kim@example.com', role: 'member', appRoles: [] },
  ]),
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

  it('list the pinned organization with its members', async () => {
    const organizations = api()
    const { lines, out } = output()
    await listOrganizationsCommand(organizations, {}, out)
    expect(organizations.listOrganizations).toHaveBeenCalledWith('1')
    expect(lines.join('')).toBe('Organization: acme (Acme)\nacme  Acme  (1)\n  bo@example.com  owner  manager,sales\n')
  })

  it('list the organization --organization names', async () => {
    const organizations = api()
    const { lines, out } = output()
    await listOrganizationsCommand(organizations, { organization: 'globex' }, out)
    expect(organizations.listOrganizations).toHaveBeenCalledWith('2')
    expect(lines.join('')).toBe('Organization: globex (Globex)\nglobex  Globex  (2)\n')
    await expect(listOrganizationsCommand(organizations, { organization: 'initech' }, out)).rejects.toThrow('No organization "initech"')
  })

  it('list every organization with --all-organizations, page by page', async () => {
    const organizations = api()
    const { lines, out } = output()
    await listOrganizationsCommand(organizations, { allOrganizations: true }, out)
    expect(organizations.listOrganizations).toHaveBeenLastCalledWith({ unscoped: 'protobase organizations list: --all-organizations' }, { createdAt: '2026-08-01 00:00:00+00', id: '1' })
    expect(lines.join('')).toBe('Every organization\nacme  Acme  (1)\n  bo@example.com  owner  manager,sales\nglobex  Globex  (2)\n')
  })

  it('create an organization with a slug from its name, keeping a given id', async () => {
    const organizations = api()
    const { lines, out } = output()
    await createOrganizationCommand(organizations, { name: 'Acme Holding', owner: 'bo@example.com', id: '1' }, out)
    expect(organizations.createOrganization).toHaveBeenCalledWith({ name: 'Acme Holding', slug: 'acme-holding', owner: 'bo@example.com', id: '1' })
    expect(organizations.addMember).not.toHaveBeenCalled()
    expect(lines.join('')).toBe('Created organization acme-holding (1), owned by bo@example.com\n')
  })

  it('bring every user in with --members all, and say who joined as what', async () => {
    const organizations = api()
    const { lines, out } = output()
    await createOrganizationCommand(organizations, { name: 'Acme', owner: 'bo@example.com', id: '1', members: 'all' }, out)
    expect(organizations.addEveryUser).toHaveBeenCalledWith('1')
    expect(organizations.addMember).not.toHaveBeenCalled()
    expect(lines.join('')).toBe(
      'Created organization acme (1), owned by bo@example.com\n  root@example.com: owner, with every app role\n  sanne@example.com: member, with sales,manager\n  kim@example.com: member\n',
    )
    await expect(createOrganizationCommand(organizations, { name: 'Acme', owner: 'bo@example.com', members: 'some' }, out)).rejects.toThrow('--members takes "all"')
  })

  it('add members and change their roles in the pinned organization', async () => {
    const organizations = api()
    const { lines, out } = output()
    await addMemberCommand(organizations, { email: 'jan@example.com', appRoles: 'accountant' }, out)
    expect(organizations.addMember).toHaveBeenCalledWith({ organization: '1', email: 'jan@example.com', appRoles: ['accountant'] })
    await setMemberRolesCommand(organizations, { email: 'jan@example.com', orgRole: 'admin' }, out)
    expect(organizations.setMemberRoles).toHaveBeenCalledWith({ organization: '1', email: 'jan@example.com', role: 'admin' })
    await removeMemberCommand(organizations, { email: 'jan@example.com' }, out)
    expect(organizations.removeMember).toHaveBeenCalledWith({ organization: '1', email: 'jan@example.com' })
    expect(lines.join('')).toBe('Added jan@example.com to acme\nChanged the roles of jan@example.com in acme\nRemoved jan@example.com from acme\n')
    await expect(setMemberRolesCommand(organizations, { email: 'jan@example.com' }, out)).rejects.toThrow('Pass --org-role, --app-roles or both')
  })

  it('add, change and remove members in the organization --organization names', async () => {
    const organizations = api()
    const { lines, out } = output()
    await addMemberCommand(organizations, { organization: 'globex', email: 'jan@example.com' }, out)
    expect(organizations.addMember).toHaveBeenCalledWith({ organization: '2', email: 'jan@example.com' })
    await setMemberRolesCommand(organizations, { organization: 'globex', email: 'jan@example.com', appRoles: 'sales' }, out)
    expect(organizations.setMemberRoles).toHaveBeenCalledWith({ organization: '2', email: 'jan@example.com', appRoles: ['sales'] })
    await removeMemberCommand(organizations, { organization: 'globex', email: 'jan@example.com' }, out)
    expect(organizations.removeMember).toHaveBeenCalledWith({ organization: '2', email: 'jan@example.com' })
    expect(lines.join('')).toBe('Added jan@example.com to globex\nChanged the roles of jan@example.com in globex\nRemoved jan@example.com from globex\n')
    await expect(addMemberCommand(organizations, { organization: 'initech', email: 'jan@example.com' }, out)).rejects.toThrow('No organization "initech"')
  })

  it('refuse --all-organizations for a membership, which is in one organization', async () => {
    const organizations = api()
    const { out } = output()
    await expect(addMemberCommand(organizations, { allOrganizations: true, email: 'jan@example.com' }, out)).rejects.toThrow('acts on one organization')
    await expect(setMemberRolesCommand(organizations, { allOrganizations: true, email: 'jan@example.com', orgRole: 'admin' }, out)).rejects.toThrow('acts on one organization')
    await expect(removeMemberCommand(organizations, { allOrganizations: true, email: 'jan@example.com' }, out)).rejects.toThrow('acts on one organization')
    expect(organizations.addMember).not.toHaveBeenCalled()
    expect(organizations.setMemberRoles).not.toHaveBeenCalled()
    expect(organizations.removeMember).not.toHaveBeenCalled()
  })

  it("give a new app role to the pinned organization's owners", async () => {
    const organizations = api()
    const { lines, out } = output()
    await addAppRoleCommand(organizations, { role: 'accountant', to: 'owners' }, out)
    expect(organizations.addAppRoleToOwners).toHaveBeenCalledWith('1', 'accountant')
    expect(lines.join('')).toBe('Organization: acme (Acme)\nGave accountant to 2 owners\n')
    await expect(addAppRoleCommand(organizations, { role: 'accountant', to: 'members' }, out)).rejects.toThrow('--to takes "owners"')
  })

  it("give a new app role to the owners of the organization --organization names, or of every one", async () => {
    const organizations = api()
    const { lines, out } = output()
    await addAppRoleCommand(organizations, { role: 'accountant', to: 'owners', organization: 'globex' }, out)
    expect(organizations.addAppRoleToOwners).toHaveBeenCalledWith('2', 'accountant')
    await addAppRoleCommand(organizations, { role: 'accountant', to: 'owners', allOrganizations: true }, out)
    expect(organizations.addAppRoleToOwners).toHaveBeenLastCalledWith({ unscoped: 'protobase organizations add-app-role: --all-organizations' }, 'accountant')
    expect(lines.join('')).toBe('Organization: globex (Globex)\nGave accountant to 2 owners\nEvery organization\nGave accountant to 2 owners\n')
  })
})
