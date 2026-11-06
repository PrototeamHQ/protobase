import { describe, expect, it } from 'vitest'
import type { ConnectionAccounts } from './connection-accounts'
import { sharedRefresh } from './connection-tokens'

// One account whose stored refresh token `rotate` replaces, as another worker's refresh would.
const account = () => {
  const state = { refreshToken: 'enc-refresh-1', refreshes: 0, refuse: false }
  const accounts: ConnectionAccounts = {
    find: async () => ({ id: 'acc-1', providerId: 'google', scopes: [], refreshToken: state.refreshToken }),
    accessToken: async () => {
      const refused = state.refuse
      state.refreshes++
      await new Promise((resolve) => setTimeout(resolve, 5))
      return refused ? undefined : `access-${state.refreshes}`
    },
  }
  return { state, accounts }
}

describe('sharedRefresh', () => {
  it('refreshes once for two steps that find the token expired together, and both get the new token', async () => {
    const { state, accounts } = account()
    const tokenOf = sharedRefresh(accounts)
    expect(await Promise.all([tokenOf('ada', 'acc-1', 'enc-refresh-1'), tokenOf('ada', 'acc-1', 'enc-refresh-1')])).toEqual(['access-1', 'access-1'])
    expect(state.refreshes).toBe(1)
  })

  it('takes the token another worker stored when its own refresh was refused for a rotated refresh token', async () => {
    const { state, accounts } = account()
    const tokenOf = sharedRefresh(accounts)
    // This worker read refresh token 0; the provider refuses it, as another worker rotated it to 1 meanwhile.
    state.refuse = true
    const first = tokenOf('ada', 'acc-1', 'enc-refresh-0')
    state.refuse = false
    expect(await first).toBe('access-2')
    expect(state.refreshes).toBe(2)
  })

  it('gives no token when the provider refuses and the stored refresh token is the one it read', async () => {
    const { state, accounts } = account()
    state.refuse = true
    expect(await sharedRefresh(accounts)('ada', 'acc-1', 'enc-refresh-1')).toBeUndefined()
    expect(state.refreshes).toBe(1)
  })
})
