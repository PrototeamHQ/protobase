import { describe, expect, it } from 'vitest'
import { fakeAdapter } from '../testing/fake-adapter'
import { checkMcpGrant } from './grant-standing'

const allowedAt = new Date('2026-08-01T10:00:00Z')
const issued = allowedAt.getTime() / 1000 + 60
const consents = () => ({ oauthConsent: [{ id: 'c1', userId: 'ana', clientId: 'assistant', referenceId: 'r1', createdAt: allowedAt }] })

describe("an MCP access token's grant", () => {
  it('stands while the person allows its client, from the second the consent was made', async () => {
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, { userId: 'ana', clientId: 'assistant', issuedAt: issued })).resolves.toBeUndefined()
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, { userId: 'ana', clientId: 'assistant', issuedAt: allowedAt.getTime() / 1000 })).resolves.toBeUndefined()
  })

  it("is gone once the client is disconnected, for another person's grant of the same client, and for another client", async () => {
    await expect(checkMcpGrant(fakeAdapter({}).adapter, { userId: 'ana', clientId: 'assistant', issuedAt: issued })).rejects.toMatchObject({ status: 401 })
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, { userId: 'bo', clientId: 'assistant', issuedAt: issued })).rejects.toMatchObject({ status: 401 })
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, { userId: 'ana', clientId: 'editor', issuedAt: issued })).rejects.toMatchObject({ status: 401 })
  })

  it('stays gone when the person allows the client again: a token from before the new consent is refused', async () => {
    const reconnected = { oauthConsent: [{ id: 'c2', userId: 'ana', clientId: 'assistant', referenceId: 'r1', createdAt: new Date(allowedAt.getTime() + 120_000) }] }
    await expect(checkMcpGrant(fakeAdapter(reconnected).adapter, { userId: 'ana', clientId: 'assistant', issuedAt: issued })).rejects.toMatchObject({ status: 401 })
  })

  it('stands under any of the consents the person gave the client, the older one included', async () => {
    const both = { oauthConsent: [{ id: 'c2', userId: 'ana', clientId: 'assistant', referenceId: 'r2', createdAt: new Date(allowedAt.getTime() + 120_000) }, ...consents().oauthConsent] }
    await expect(checkMcpGrant(fakeAdapter(both).adapter, { userId: 'ana', clientId: 'assistant', issuedAt: issued })).resolves.toBeUndefined()
  })

  it('is refused for a token that names no client or no issue time', async () => {
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, { userId: 'ana', issuedAt: issued })).rejects.toMatchObject({ status: 401 })
    await expect(checkMcpGrant(fakeAdapter(consents()).adapter, { userId: 'ana', clientId: 'assistant' })).rejects.toMatchObject({ status: 401 })
  })
})
