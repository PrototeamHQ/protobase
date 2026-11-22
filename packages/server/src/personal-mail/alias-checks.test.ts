import { describe, expect, it, vi } from 'vitest'
import { aliasChecks } from './alias-checks'
import { issued, token } from './mail-check-responses'
import type { MailCheckService } from './mail-check-service'
import type { PersonalMail } from './personal-mailer'

const checking = (from?: string) => {
  const service: MailCheckService = { issue: vi.fn(async () => issued), received: vi.fn(async () => from) }
  const send = vi.fn<PersonalMail['send']>(async () => ({}))
  const mailOf = vi.fn((_userId: string): PersonalMail => ({ send, sender: vi.fn(), senders: vi.fn() }))
  return { send, mailOf, checks: aliasChecks(service, mailOf) }
}

describe('a From address check', () => {
  it("sends a test message from the address through the person's mailbox to a one-time address, and answers its token", async () => {
    const { send, mailOf, checks } = checking()
    expect(await checks.start('user-1', 'billing@shop.example', 'en')).toBe(token)
    expect(mailOf).toHaveBeenCalledWith('user-1')
    expect(send).toHaveBeenCalledWith({ from: 'billing@shop.example', to: issued.address, subject: expect.stringContaining('billing@shop.example'), text: expect.stringContaining('billing@shop.example') })
  })

  it('waits until the message arrived, then confirms its From or names the address it came from instead', async () => {
    expect(await checking().checks.result(token, 'billing@shop.example')).toEqual({ status: 'waiting' })
    expect(await checking('Billing@Shop.example').checks.result(token, 'billing@shop.example')).toEqual({ status: 'confirmed', from: 'Billing@Shop.example' })
    expect(await checking('ana@gmail.example').checks.result(token, 'billing@shop.example')).toEqual({ status: 'mismatch', from: 'ana@gmail.example' })
  })
})
