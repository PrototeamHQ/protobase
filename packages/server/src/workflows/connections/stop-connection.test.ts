import { describe, expect, it, vi } from 'vitest'
import { ConnectionError } from '@protobase/workflows/plugin'
import type { ConnectionAccount, ConnectionAccounts } from './connection-accounts'
import { sharedRefresh } from './connection-tokens'
import { stopConnection, type StopUse } from './stop-connection'

const declaration = { label: 'Acme account', scopes: ['mail'], oauth: { authorization_url: 'https://acme.test/a', token_url: 'https://acme.test/t', user_info_url: 'https://acme.test/u' } }
const adaAccount: ConnectionAccount = { id: 'acc-1', providerId: 'workflow-acme-account', scopes: ['openid', 'mail'], refreshToken: 'refresh-1' }

// Accounts kept by their owner: `find` and `accessToken` answer only for the owner's own account.
const accountsOf = (owned: Record<string, ConnectionAccount[]>, { refused = false } = {}) => {
  const accessToken = vi.fn(async (userId: string, accountId: string) => (owned[userId]?.some((account) => account.id === accountId) && !refused ? 'access-1' : undefined))
  const accounts: ConnectionAccounts = { find: async (userId, accountId) => owned[userId]?.find((account) => account.id === accountId), accessToken }
  return { accounts, accessToken }
}

const connect = (accounts: ConnectionAccounts, use: Partial<StopUse>) => {
  const issued: string[] = []
  const connection = stopConnection({ accounts, refresh: sharedRefresh(accounts) })({ plugin: 'acme', name: 'account', declaration, accountId: 'acc-1', userId: 'ada', secret: (token) => void issued.push(token), ...use })
  return { connection, issued }
}

const notConnected = expect.objectContaining({ code: 'not_connected' })

describe('stopConnection', () => {
  it("gives a token of the recorded account while it belongs to the recorded person, and hands it to be blanked out", async () => {
    const { accounts } = accountsOf({ ada: [adaAccount] })
    const { connection, issued } = connect(accounts, {})
    expect(await connection.accessToken()).toBe('access-1')
    expect(issued).toEqual(['access-1'])
  })

  it('gives nothing to a trigger that recorded no person or no account, as one from before they were kept', async () => {
    const { accounts, accessToken } = accountsOf({ ada: [adaAccount] })
    await expect(connect(accounts, { userId: null }).connection.accessToken()).rejects.toEqual(notConnected)
    await expect(connect(accounts, { accountId: null }).connection.accessToken()).rejects.toEqual(notConnected)
    expect(accessToken).not.toHaveBeenCalled()
  })

  it("refuses an account that is gone, someone else's, or whose person was removed", async () => {
    const { accounts, accessToken } = accountsOf({ ada: [], grace: [adaAccount] })
    await expect(connect(accounts, {}).connection.accessToken()).rejects.toEqual(notConnected)
    await expect(connect(accounts, { userId: 'removed' }).connection.accessToken()).rejects.toEqual(notConnected)
    expect(accessToken).not.toHaveBeenCalled()
  })

  it("refuses an account of another provider, or one that lost the connection's scopes", async () => {
    const other = accountsOf({ ada: [{ ...adaAccount, providerId: 'other-provider' }] })
    await expect(connect(other.accounts, {}).connection.accessToken()).rejects.toEqual(notConnected)
    const narrowed = accountsOf({ ada: [{ ...adaAccount, scopes: ['openid'] }] })
    await expect(connect(narrowed.accounts, {}).connection.accessToken()).rejects.toEqual(notConnected)
  })

  it('fails not_connected and gives no token when the provider refuses the refresh', async () => {
    const { accounts } = accountsOf({ ada: [adaAccount] }, { refused: true })
    const { connection, issued } = connect(accounts, {})
    await expect(connection.accessToken()).rejects.toEqual(new ConnectionError('not_connected', 'The account connected for acme:account no longer signs in, so this trigger cannot end its subscription with it'))
    expect(issued).toEqual([])
  })
})

describe('stopConnection, while the token is fetched', () => {
  // Ada's account, which `during` changes as the token is fetched.
  const changing = (during: (owned: Record<string, ConnectionAccount[]>) => void) => {
    const owned: Record<string, ConnectionAccount[]> = { ada: [adaAccount] }
    const accessToken = async () => {
      during(owned)
      return 'access-1'
    }
    const accounts: ConnectionAccounts = { find: async (userId, accountId) => owned[userId]?.find((account) => account.id === accountId), accessToken }
    return accounts
  }

  it('gives no token once the account is deleted, or linked to someone else', async () => {
    for (const during of [(owned: Record<string, ConnectionAccount[]>) => void (owned.ada = []), (owned: Record<string, ConnectionAccount[]>) => void Object.assign(owned, { ada: [], grace: [adaAccount] })]) {
      const failure = await connect(changing(during), {}).connection.accessToken().catch((error: unknown) => error)
      expect(failure).toEqual(notConnected)
      expect(`${JSON.stringify(failure)} ${(failure as Error).message}`).not.toContain('access-1')
    }
  })

  it('gives no token when reading the account again fails', async () => {
    const { accounts } = accountsOf({ ada: [adaAccount] })
    const find = vi.fn(accounts.find).mockImplementationOnce(accounts.find).mockRejectedValueOnce(new Error('connection terminated'))
    await expect(connect({ ...accounts, find }, {}).connection.accessToken()).rejects.toEqual(new Error('connection terminated'))
  })
})
