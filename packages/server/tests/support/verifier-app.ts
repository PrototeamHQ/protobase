import { vi } from 'vitest'
import { base64url } from 'jose'
import { gmailSendScope, gmailSendUrl } from '../../src/personal-mail/gmail'
import { sentMessage } from '../../src/personal-mail/gmail-responses'
import type { SenderAddressVerifier, VerificationOutcome, VerifyInput } from '../../src/personal-mail/verifiers/sender-address-verifier'
import { serveMcp, type McpStores } from './mcp-app'

// The From address verification tests: an app with Gmail as its mailbox and a verifier the test drives.

export type Served = Awaited<ReturnType<typeof serveMcp>>

/** Far ahead of any clock: the database's own times are real while the test's are fixed, so a time the test gives must lie after both. */
export const farAhead = new Date('2099-01-01T00:00:00Z')

/**
 * A verifier as a platform's test-mail check would be, which records each input and sends its test message to a
 * one-time address; `outcome` is what `verify` answers, and `check`, when given, what the sweep's check answers.
 */
export const testVerifier = (outcome: (input: VerifyInput) => Promise<VerificationOutcome> = async () => ({ state: 'pending', expires_at: farAhead }), check?: SenderAddressVerifier['check']) => {
  const inputs: VerifyInput[] = []
  const verifier: SenderAddressVerifier = {
    id: 'test-mail',
    verify: async (input, tools) => {
      inputs.push(input)
      await tools.send({ to: `check-${inputs.length}@verify.example`, subject: `Test from ${input.address}`, text: 'A test message.' })
      return outcome(input)
    },
    ...(check && { check }),
  }
  return { verifier, inputs }
}

const personalMail = { personalMail: ['gmail' as const], encryptOAuthTokens: true, socialProviders: { google: { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'client-secret' } } }

/** The app with `verifiers`, Ana signed in with her Gmail linked, and Gmail's sends at the network's edge. */
export const servedWith = async (stores: McpStores, verifiers: SenderAddressVerifier[]) => {
  const sent: string[] = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== gmailSendUrl) throw new Error(`Unexpected request to ${String(input)}`)
    sent.push(new TextDecoder().decode(init!.body as Uint8Array))
    return new Response(JSON.stringify(sentMessage), { headers: { 'content-type': 'application/json' } })
  })
  const app = await serveMcp(stores, { auth: { ...personalMail, senderVerifiers: verifiers } })
  const cookie = await app.signIn('ana@example.com')
  const idToken = `${base64url.encode(JSON.stringify({ alg: 'none' }))}.${base64url.encode(JSON.stringify({ sub: 'ana', email: 'ana@gmail.example', email_verified: true }))}.`
  const { internalAdapter } = await app.auth.$context
  await internalAdapter.createAccount({ userId: await app.userId('ana@example.com'), providerId: 'google', accountId: 'google-ana', scope: gmailSendScope, idToken, accessToken: 'access-1', accessTokenExpiresAt: new Date(Date.now() + 3_600_000) })

  const add = async (address: string) => ((await (await app.request('/api/auth/account/mail-senders/add', { cookie, body: { address } })).json()) as { sender: { id: string } }).sender.id
  const verify = (id: string, as = cookie) => app.request('/api/auth/account/mail-senders/verify', { cookie: as, body: { id } })
  const list = async () => (await (await app.request('/api/auth/account/mail-senders', { cookie })).json()) as { verifiers: boolean; senders: { id: string; state: string; verifications?: object[] }[] }
  const stateOf = async (id: string) => (await list()).senders.find((sender) => sender.id === id)!.state
  const report = (body: object, path = '/api/auth/mail-sender-verifications/report') => app.request(path, { body, from: null })
  // How long each stays pending and counts as verified, worked out by Postgres: the times it makes come back as stand-ins in a recording.
  const rows = async (id: string) =>
    (await app.store.query<{ state: string; secret_hash: string; error_code: string | null; error: string | null; pending_hours: number; valid_days: number | null }>(
      `select state, secret_hash, error_code, error,
  case when state = 'pending' then extract(epoch from expires_at - created_at)::float8 / 3600 end as pending_hours,
  extract(epoch from valid_until - settled_at)::float8 / 86400 as valid_days
from mail_sender_verification where sender_id = $1 order by created_at, id`,
      [id],
    )).rows
  return { app, cookie, sent, add, verify, list, stateOf, report, rows }
}
