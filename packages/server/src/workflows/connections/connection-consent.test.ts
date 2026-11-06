import { describe, expect, it } from 'vitest'
import type { Definition } from '@protobase/workflows'
import type { Session } from '../../types'
import type { ConnectionAccount, ConnectionAccounts } from './connection-accounts'
import { connectionConsent } from './connection-consent'

const scope = 'https://www.googleapis.com/auth/gmail.readonly'
const google = { label: 'Google account', signIn: 'google', scopes: [scope] }
// Ada's Google account holds the scope, her second one does not; Grace's is hers alone.
const owned: Record<string, ConnectionAccount[]> = {
  ada: [{ id: 'acc-ada', providerId: 'google', scopes: ['openid', scope], refreshToken: 'r1' }, { id: 'acc-ada-bare', providerId: 'google', scopes: ['openid'], refreshToken: 'r2' }],
  grace: [{ id: 'acc-grace', providerId: 'google', scopes: [scope], refreshToken: 'r3' }],
}
const accounts: ConnectionAccounts = { find: async (userId, id) => owned[userId]?.find((account) => account.id === id), accessToken: async () => undefined }
const consent = connectionConsent({ accounts, declarationOf: (key) => (key === 'acme:google' ? google : undefined), connectionOf: { 'acme:inbox': 'acme:google' } })

const own = (id: string, extra: Partial<Session> = {}): Session => ({ user: { id, roles: ['builder'] }, signIn: { staff: false }, ...extra })
const definition = (connections?: Record<string, string>): Definition => ({
  trigger: { 'acme:inbox': {} },
  stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } },
  ...(connections && { connections }),
})
const manual: Definition = { ...definition(), trigger: { manual: {} } }
const refusal = async (promise: Promise<unknown>) => promise.then(() => undefined, (error: { status: number; slug: string; message: string }) => ({ status: error.status, slug: error.slug, message: error.message }))

describe('connectionConsent', () => {
  it('lets the owner of the bound account, signed in as themselves, turn the version on as its consent', async () => {
    expect(await consent(own('ada'), definition({ 'acme:google': 'acc-ada' }))).toBe('ada')
  })

  it("refuses someone else's account, an unknown id, and an account without the scopes, all with the same answer", async () => {
    const answers = await Promise.all(['acc-grace', 'no-such-account', 'acc-ada-bare'].map((id) => refusal(consent(own('ada'), definition({ 'acme:google': id })))))
    expect(answers[0]).toMatchObject({ status: 403, slug: 'own-sign-in-only' })
    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1)
  })

  it('refuses the owner through staff signed in as them, an outside app acting for them, and a visitor', async () => {
    const bound = definition({ 'acme:google': 'acc-ada' })
    for (const session of [own('ada', { signIn: { staff: true } }), own('ada', { client: { id: 'mcp-client', scopes: [] } }), own('ada', { signIn: undefined }), own('ada', { anonymous: true })]) {
      expect(await refusal(consent(session, bound))).toMatchObject({ status: 403, slug: 'own-sign-in-only' })
    }
  })

  it('refuses turning on a version whose connection binds no account yet', async () => {
    expect(await refusal(consent(own('ada'), definition()))).toMatchObject({ status: 400, slug: 'invalid-workflow', message: expect.stringContaining('acme:google') })
  })

  it('keeps who turned on a version without connections only when they are signed in as themselves', async () => {
    expect(await consent(own('ada'), manual)).toBe('ada')
    expect(await consent(own('ada', { client: { id: 'mcp-client', scopes: [] } }), manual)).toBeNull()
  })
})
