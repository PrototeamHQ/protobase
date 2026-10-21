import { describe, expect, it } from 'vitest'
import { defaultSignInPolicy } from '../sign-in-policy'
import { fakeContext } from '../testing/fake-adapter'
import { mcpTokenClaims, type GrantUser } from './mcp-token-claims'

const now = new Date('2026-10-20T12:00:00Z')
const ana: GrantUser = { id: 'ana', email: 'ana@example.com', emailVerified: true, role: 'admin,sales' }
const plain = { organizations: false, mail: true, defaultPolicy: defaultSignInPolicy, now }
const description = (error: unknown) => (error as { body?: { error?: string; error_description?: string } }).body

const refusal = async (promise: Promise<unknown>) => {
  const error = await promise.then(() => undefined, (thrown: unknown) => thrown)
  expect(description(error)?.error).toBe('invalid_grant')
  return description(error)?.error_description
}

describe('the claims of an MCP token', () => {
  it('carry the role the grant was made with, narrowed to it', async () => {
    const { context } = fakeContext()
    expect(await mcpTokenClaims(context, plain, ana, 'role=sales')).toEqual({ email: 'ana@example.com', role: 'sales' })
  })

  it('carry the organization and the membership role, with organizations', async () => {
    const { context } = fakeContext(
      { member: [{ id: 'm1', organizationId: 'acme', userId: 'bo', role: 'member', appRoles: ['sales'] }], organization: [{ id: 'acme' }] },
      ['organization'],
    )
    const bo = { ...ana, id: 'bo', email: 'bo@example.com', role: 'user' }
    expect(await mcpTokenClaims(context, { ...plain, organizations: true }, bo, 'organization=acme&role=sales')).toEqual({
      email: 'bo@example.com',
      role: 'user',
      org: 'acme',
      org_role: 'member',
      app_roles: ['sales'],
    })
  })

  it('are refused without a user', async () => {
    expect(await refusal(mcpTokenClaims(fakeContext().context, plain, null, 'role=sales'))).toBe('This grant has no user.')
  })

  it('are refused while a ban holds, and given once it expired', async () => {
    const { context } = fakeContext()
    expect(await refusal(mcpTokenClaims(context, plain, { ...ana, banned: true }, 'role=sales'))).toBe('This account is blocked.')
    expect(await refusal(mcpTokenClaims(context, plain, { ...ana, banned: true, banExpires: new Date('2026-10-21') }, 'role=sales'))).toBe('This account is blocked.')
    expect(await mcpTokenClaims(context, plain, { ...ana, banned: true, banExpires: '2026-10-19T00:00:00Z' }, 'role=sales')).toMatchObject({ role: 'sales' })
  })

  it('are refused for an address that is not verified', async () => {
    const { context } = fakeContext()
    for (const emailVerified of [false, null, undefined]) {
      expect(await refusal(mcpTokenClaims(context, plain, { ...ana, emailVerified }, 'role=sales'))).toMatch(/^Confirm your address/)
    }
  })

  it('are refused while the sign-in policy asks for setup', async () => {
    const { context } = fakeContext({ signInPolicy: [{ id: 'p1', ...defaultSignInPolicy, twoFactor: 'required', createdAt: now }] })
    expect(await refusal(mcpTokenClaims(context, plain, ana, 'role=sales'))).toMatch(/^Set up what this app's sign-in policy requires/)
    expect(await mcpTokenClaims(context, plain, { ...ana, twoFactorEnabled: true }, 'role=sales')).toMatchObject({ role: 'sales' })
  })

  it('are refused for a grant made with no role', async () => {
    const { context } = fakeContext()
    expect(await refusal(mcpTokenClaims(context, plain, ana, ''))).toMatch(/^You had no role/)
    expect(await refusal(mcpTokenClaims(context, plain, ana, undefined))).toMatch(/^You had no role/)
  })

  it('are refused once the role is no longer held', async () => {
    const { context } = fakeContext()
    expect(await refusal(mcpTokenClaims(context, plain, { ...ana, role: 'admin' }, 'role=sales'))).toMatch(/^Your role or organization changed/)
  })

  it('are refused once the person may no longer enter the organization', async () => {
    const { context } = fakeContext({ member: [], organization: [{ id: 'acme' }] }, ['organization'])
    // A global role holds everywhere, but entering the organization needs it to exist.
    const cy = { ...ana, id: 'cy', role: 'support' }
    expect(await mcpTokenClaims(context, { ...plain, organizations: true }, cy, 'organization=acme&role=support')).toMatchObject({ role: 'support', org: 'acme' })
    expect(await refusal(mcpTokenClaims(context, { ...plain, organizations: true }, cy, 'organization=gone&role=support'))).toMatch(/^Your role or organization changed/)
    // A membership role ends with the membership.
    const bo = { ...ana, id: 'bo', role: 'user' }
    expect(await refusal(mcpTokenClaims(context, { ...plain, organizations: true }, bo, 'organization=acme&role=sales'))).toMatch(/^Your role or organization changed/)
  })
})
