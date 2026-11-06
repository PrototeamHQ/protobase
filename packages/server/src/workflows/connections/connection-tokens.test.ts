import { describe, expect, it, vi } from 'vitest'
import type { Deps } from '../../deps'
import { recordedDb } from '../triggers/recorded-db'
import type { ConnectionAccounts } from './connection-accounts'
import { connectionTexts } from './connection-texts'
import { connectionTokens, sharedRefresh } from './connection-tokens'

const declaration = { label: 'Acme account', scopes: ['mail'], oauth: { authorization_url: 'https://acme.test/a', token_url: 'https://acme.test/t', user_info_url: 'https://acme.test/u' } }

describe('connectionTokens', () => {
  it('gives not_connected without looking up an account when the version records nobody who turned it on', async () => {
    const { db } = recordedDb(() => [{ account: 'acc-1', enabled_by: null, tenant_id: null }])
    const accounts: ConnectionAccounts = { find: vi.fn(async () => undefined), accessToken: vi.fn(async () => 'access-1') }
    const roles = vi.fn(async () => ['builder'])
    const tokens = connectionTokens({ deps: () => ({ db }) as unknown as Deps, schema: 'workflows', roles, accounts, refresh: sharedRefresh(accounts), text: connectionTexts(undefined) })
    const connection = tokens({ plugin: 'acme', name: 'account', declaration, version: async () => ({ workflowId: 'wf-1', version: 1 }), secret: () => {} })
    await expect(connection.accessToken()).rejects.toMatchObject({ code: 'not_connected' })
    expect(roles).not.toHaveBeenCalled()
    expect(accounts.find).not.toHaveBeenCalled()
    expect(accounts.accessToken).not.toHaveBeenCalled()
  })
})
