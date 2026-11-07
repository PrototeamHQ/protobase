import { describe, expect, it, vi } from 'vitest'
import { ConnectionError } from '@protobase/workflows/plugin'
import { accountToken, type AccountUse } from './account-token'
import type { ConnectionAccount, ConnectionAccounts } from './connection-accounts'
import { sharedRefresh } from './connection-tokens'

const declaration = { label: 'Acme account', scopes: ['mail'], oauth: { authorization_url: 'https://acme.test/a', token_url: 'https://acme.test/t', user_info_url: 'https://acme.test/u' } }
const adaAccount: ConnectionAccount = { id: 'acc-1', providerId: 'workflow-acme-account', scopes: ['openid', 'mail'], refreshToken: 'refresh-1' }
const token = 'access-token-1'

// Ada's accounts, which `during` changes while the token is fetched, as a disconnect or a link to someone else would.
const accountsOf = (during: (owned: Record<string, ConnectionAccount[]>) => void = () => {}) => {
  const owned: Record<string, ConnectionAccount[]> = { ada: [adaAccount] }
  const accounts: ConnectionAccounts = {
    find: async (userId, accountId) => owned[userId]?.find((account) => account.id === accountId),
    accessToken: async () => {
      during(owned)
      return token
    },
  }
  return accounts
}

const fetchToken = async (accounts: ConnectionAccounts, use: Partial<AccountUse> = {}) => {
  const issued: string[] = []
  const refused = () => new ConnectionError('not_connected', 'This workflow has no connection it may use for acme:account')
  const result = await accountToken({ accounts, refresh: sharedRefresh(accounts) })({ userId: 'ada', accountId: 'acc-1', plugin: 'acme', name: 'account', declaration, secret: (value) => void issued.push(value), ...use }, refused).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  )
  return { result, issued }
}

describe('accountToken', () => {
  it('gives the token of an account that stays its owner\'s, and hands it to be blanked out', async () => {
    expect(await fetchToken(accountsOf())).toEqual({ result: { value: token }, issued: [token] })
  })

  it('gives not_connected and no token once the account is deleted while its token is fetched, the token still blanked out', async () => {
    const { result, issued } = await fetchToken(accountsOf((owned) => void (owned.ada = [])))
    expect(result).toEqual({ error: expect.objectContaining({ code: 'not_connected' }) })
    const { error } = result as { error: ConnectionError }
    expect(`${JSON.stringify(error)} ${error.message}`).not.toContain(token)
    expect(issued).toEqual([token])
  })

  it('gives not_connected and no token once the account is linked to someone else while its token is fetched', async () => {
    const { result } = await fetchToken(accountsOf((owned) => {
      owned.ada = []
      owned.grace = [adaAccount]
    }))
    expect(result).toEqual({ error: expect.objectContaining({ code: 'not_connected' }) })
  })

  it("gives not_connected once the account lost the connection's scopes while its token is fetched", async () => {
    const { result } = await fetchToken(accountsOf((owned) => void (owned.ada = [{ ...adaAccount, scopes: ['openid'] }])))
    expect(result).toEqual({ error: expect.objectContaining({ code: 'not_connected' }) })
  })

  it('gives no token when reading the account again fails, failing with that read\'s own error', async () => {
    const accounts = accountsOf()
    const find = vi.fn(accounts.find).mockImplementationOnce(accounts.find).mockRejectedValueOnce(new Error('connection terminated'))
    const { result } = await fetchToken({ ...accounts, find })
    expect(result).toEqual({ error: new Error('connection terminated') })
  })

  it("refuses before fetching an account that is not the person's", async () => {
    const accessToken = vi.fn(async () => token)
    const { result } = await fetchToken({ find: async () => undefined, accessToken }, { userId: 'grace' })
    expect(result).toEqual({ error: expect.objectContaining({ code: 'not_connected' }) })
    expect(accessToken).not.toHaveBeenCalled()
  })

  it('checks each caller that joined one forced refresh on its own: one whose account moved away meanwhile gets nothing', async () => {
    const owned: Record<string, ConnectionAccount[]> = { ada: [adaAccount], grace: [] }
    let release = () => {}
    const accounts: ConnectionAccounts = {
      find: async (userId, accountId) => owned[userId]?.find((account) => account.id === accountId),
      accessToken: vi.fn(async (_userId: string, _accountId: string, options?: { refresh?: boolean }) => {
        expect(options).toEqual({ refresh: true })
        await new Promise<void>((resolve) => (release = resolve))
        return token
      }),
    }
    const tokenOf = accountToken({ accounts, refresh: sharedRefresh(accounts) })
    const refused = () => new ConnectionError('not_connected', 'none')
    const use = { accountId: 'acc-1', plugin: 'acme', name: 'account', declaration, secret: () => {} }
    const ada = tokenOf({ ...use, userId: 'ada' }, refused, { refresh: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    // Grace now holds the account and joins the refresh Ada started; then it goes back to Ada.
    owned.grace = [adaAccount]
    owned.ada = []
    const grace = tokenOf({ ...use, userId: 'grace' }, refused, { refresh: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    owned.grace = []
    owned.ada = [adaAccount]
    release()
    expect(await ada).toBe(token)
    await expect(grace).rejects.toMatchObject({ code: 'not_connected' })
    expect(accounts.accessToken).toHaveBeenCalledTimes(1)
  })
})
