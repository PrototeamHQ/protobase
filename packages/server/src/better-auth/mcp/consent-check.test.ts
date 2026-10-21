import { describe, expect, it } from 'vitest'
import { fakeAdapter } from '../testing/fake-adapter'
import { mcpConsentCheck } from './consent-check'

const consent = { id: 'c1', clientId: 'assistant', userId: 'ana', referenceId: 'role=sales', scopes: ['mcp', 'offline_access'] }

const check = (input: { clientId?: string; userId?: string | null; referenceId?: string }) => {
  const { adapter } = fakeAdapter({ oauthConsent: [consent] })
  const { clientId = 'assistant', userId = 'ana', referenceId } = input
  const accessToken = mcpConsentCheck().claims!.accessToken!
  return accessToken({
    ctx: { context: { adapter } },
    client: { clientId },
    user: userId === null ? null : { id: userId },
    referenceId,
    scopes: [],
  } as unknown as Parameters<typeof accessToken>[0])
}

const refused = { body: { error: 'invalid_grant', error_description: 'You disconnected this client: connect it again.' } }

describe('the consent check on every MCP token', () => {
  it('passes, adding nothing, while the consent of the client, user and grant exists', async () => {
    expect(await check({ referenceId: 'role=sales' })).toEqual({})
  })

  it("refuses another client's, another user's or another grant's consent", async () => {
    await expect(check({ clientId: 'editor', referenceId: 'role=sales' })).rejects.toMatchObject(refused)
    await expect(check({ userId: 'bo', referenceId: 'role=sales' })).rejects.toMatchObject(refused)
    await expect(check({ referenceId: 'role=admin' })).rejects.toMatchObject(refused)
  })

  it('refuses without a user or a grant', async () => {
    await expect(check({ userId: null, referenceId: 'role=sales' })).rejects.toMatchObject(refused)
    await expect(check({})).rejects.toMatchObject(refused)
    await expect(check({ referenceId: '' })).rejects.toMatchObject(refused)
  })
})
