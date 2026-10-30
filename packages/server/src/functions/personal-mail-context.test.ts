import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@protobase/query'
import { createErrorHandler } from '../error-handler'
import type { MailMessage } from '../mail/smtp-mailer'
import { PersonalMailError } from '../personal-mail/personal-mail-error'
import { unauthorized } from '../problem'
import type { Session } from '../types'
import { defineFunction, type ApiFunction } from './define-function'
import type { FunctionRecords } from './records'
import { functionRoutes, type FunctionRoutesInput } from './routes'

const own = { staff: false }
const sessions: Record<string, Session> = {
  ann: { user: { id: 'ann', roles: ['admin'] }, signIn: own },
  bob: { user: { id: 'bob', roles: ['admin'] }, signIn: own },
  // Staff signed in as Bob, for support.
  staff: { user: { id: 'bob', roles: ['admin'] }, signIn: { staff: true } },
  // An outside app, such as an MCP client, with a token Bob gave it.
  app: { user: { id: 'bob', roles: ['admin'] }, signIn: own, client: { id: 'mcp-client', scopes: ['openid', 'profile'] } },
}
const authenticate = (request: Request) => {
  const session = sessions[request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '']
  if (!session) throw unauthorized('Missing or invalid bearer token')
  return session
}

const serve = (functions: Record<string, ApiFunction>, personalMailer?: FunctionRoutesInput['personalMailer']) =>
  functionRoutes({
    basePath: '/api/functions',
    functions,
    authenticate,
    access: {},
    db: {} as Db,
    records: () => ({}) as FunctionRecords,
    channels: { broadcast: async () => {} },
    decryptField: () => async () => null,
    ...(personalMailer && { personalMailer }),
    onError: createErrorHandler(vi.fn()),
    wake: vi.fn(),
    report: vi.fn(),
  })

const invoice: MailMessage = { to: 'client@example.com', subject: 'Invoice 7', text: 'Attached.', attachments: [{ filename: 'invoice-7.pdf', content: new Uint8Array([37, 80, 68, 70]) }] }
const sendInvoice = defineFunction(async (_request, context) => {
  await context.personalMail.send(invoice)
  return new Response(null, { status: 204 })
})

describe('a function’s personalMail', () => {
  it('sends from the caller’s own mailbox', async () => {
    const sent: [string, MailMessage][] = []
    const app = serve({ send: sendInvoice }, (userId) => ({ send: async (message) => void sent.push([userId, message]) }))
    expect((await app.request('/api/functions/send', { headers: { authorization: 'Bearer bob' } })).status).toBe(204)
    expect(sent).toEqual([['bob', invoice]])
  })

  it('answers a mailbox that is not linked as a 409 problem with its code, for the app to offer linking', async () => {
    const app = serve({ send: sendInvoice }, () => ({ send: async () => Promise.reject(new PersonalMailError('not_linked')) }))
    const response = await app.request('/api/functions/send', { headers: { authorization: 'Bearer ann' } })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:personal-mail-not-linked', code: 'not_linked' })
  })

  it('refuses staff signed in as someone, sending nothing from their mailbox', async () => {
    const send = vi.fn(async () => {})
    const app = serve({ send: sendInvoice }, () => ({ send }))
    const response = await app.request('/api/functions/send', { headers: { authorization: 'Bearer staff' } })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:own-sign-in-only' })
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses an outside app acting for someone, sending nothing from their mailbox', async () => {
    const personalMailer = vi.fn(() => ({ send: async () => {} }))
    const app = serve({ send: sendInvoice }, personalMailer)
    const response = await app.request('/api/functions/send', { headers: { authorization: 'Bearer app' } })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ type: 'urn:protobase:problem:own-sign-in-only' })
    expect(personalMailer).not.toHaveBeenCalled()
  })

  it('is not on a public function’s context, nor on its caller, even with the person signed in', async () => {
    const personalMailer = vi.fn(() => ({ send: async () => {} }))
    let seen: object[] = []
    const app = serve({ hook: defineFunction({ public: true }, async (_request, context) => {
      seen = [context, await context.caller()]
      return new Response(null, { status: 204 })
    }) }, personalMailer)
    expect((await app.request('/api/functions/hook', { headers: { authorization: 'Bearer bob' } })).status).toBe(204)
    expect(seen).toHaveLength(2)
    for (const value of seen) expect(value).not.toHaveProperty('personalMail')
    expect(personalMailer).not.toHaveBeenCalled()
  })

  it('rejects, naming the setting, when the app links no mailboxes', async () => {
    let failure: unknown
    const app = serve({ send: defineFunction(async (_request, context) => {
      failure = await context.personalMail.send(invoice).catch((error: unknown) => error)
      return new Response(null, { status: 204 })
    }) })
    await app.request('/api/functions/send', { headers: { authorization: 'Bearer ann' } })
    expect(failure).toEqual(new Error('Personal mail is off: name the mail providers people may link in auth.personalMail, such as ["gmail"]'))
  })
})
