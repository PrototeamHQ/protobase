import { describe, expect, it } from 'vitest'
import { fakeAdapter } from '../testing/fake-adapter'
import { checkMcpGrant } from './grant-standing'

const consents = () => ({ oauthConsent: [{ id: 'c1', userId: 'ana', clientId: 'assistant', referenceId: 'r1' }] })

describe("an MCP access token's grant", () => {
  it('stands while the person allows its client', async () => {
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, 'ana', 'assistant')).resolves.toBeUndefined()
  })

  it("is gone once the client is disconnected, for another person's grant of the same client, and for another client", async () => {
    await expect(checkMcpGrant(fakeAdapter({}).adapter, 'ana', 'assistant')).rejects.toMatchObject({ status: 401 })
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, 'bo', 'assistant')).rejects.toMatchObject({ status: 401 })
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, 'ana', 'editor')).rejects.toMatchObject({ status: 401 })
  })

  it('is refused for a token that names no client', async () => {
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, 'ana', undefined)).rejects.toMatchObject({ status: 401 })
  })
})
