import { describe, expect, it, vi } from 'vitest'
import type { RequestAccess } from '../request-access'
import type { Session } from '../types'
import { checkMailSenders } from './check-mail-senders'
import type { MailSender } from './mail-sender'

const anaSenders: MailSender[] = [{ address: 'Ana@Gmail.example', ownerId: 'ana' }, { address: 'billing@acme.example', name: 'Acme billing', ownerId: 'ana' }]

const accessFor = (session: Partial<Session>, mailSenders?: (userId: string) => Promise<MailSender[]>) =>
  ({
    full: { fields: { send_from: { type: 'mail_sender' }, name: { type: 'text' } } },
    session: { user: { id: 'ana', roles: [] }, ...session },
    deps: mailSenders ? { mailSenders } : {},
  }) as unknown as RequestAccess

const ana = () => accessFor({}, vi.fn(async (userId: string) => (userId === 'ana' ? anaSenders : [])))

describe('checkMailSenders', () => {
  it('stores an address the person may send from as their sender spells it', async () => {
    expect(await checkMailSenders(ana(), { name: 'Initech', send_from: ' BILLING@acme.example' })).toEqual({ name: 'Initech', send_from: 'billing@acme.example' })
    expect(await checkMailSenders(ana(), { send_from: 'ana@gmail.example' })).toEqual({ send_from: 'Ana@Gmail.example' })
  })

  it('refuses any other address, naming it', async () => {
    await expect(checkMailSenders(ana(), { send_from: 'eve@acme.example' })).rejects.toMatchObject({
      status: 400,
      extras: { errors: [{ field: 'send_from', code: 'invalid-value', params: { address: 'eve@acme.example' } }] },
    })
  })

  it("leaves a stored address as it is when an update gives it again, though it is no longer the person's", async () => {
    const access = accessFor({}, vi.fn(async () => []))
    expect(await checkMailSenders(access, { name: 'Initech BV', send_from: 'OLD@acme.example' }, { send_from: 'old@acme.example' })).toEqual({ name: 'Initech BV' })
    expect(access.deps.mailSenders).not.toHaveBeenCalled()
  })

  it('clears the field, and reads no senders, for a null', async () => {
    const access = ana()
    expect(await checkMailSenders(access, { send_from: null }, { send_from: 'billing@acme.example' })).toEqual({ send_from: null })
    expect(access.deps.mailSenders).not.toHaveBeenCalled()
  })

  it('refuses every address for a visitor and on an app without personal mail', async () => {
    const visitor = accessFor({ anonymous: true }, vi.fn(async () => anaSenders))
    await expect(checkMailSenders(visitor, { send_from: 'billing@acme.example' })).rejects.toMatchObject({ status: 400 })
    expect(visitor.deps.mailSenders).not.toHaveBeenCalled()
    await expect(checkMailSenders(accessFor({}), { send_from: 'billing@acme.example' })).rejects.toMatchObject({ status: 400 })
  })
})
