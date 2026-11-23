import { describe, expect, it, vi } from 'vitest'
import type { PersonalMail } from '../personal-mailer'
import { verifyTools } from './verify-tools'

const mailbox = () => {
  const send = vi.fn(async () => ({}))
  return { mail: { send } as unknown as PersonalMail, send }
}

describe('verifyTools', () => {
  it("sends through the address's own mailbox, From that record, reading only the recipient, subject and bodies", async () => {
    const { mail, send } = mailbox()
    const message = { to: 'check-1@verify.example', subject: 'Test', text: 'Hello', html: '<p>Hello</p>', from: 'ceo@bank.example', sender_address_id: 'someone-else', cc: 'victim@example.com', bcc: 'victim@example.com', headers: { From: 'ceo@bank.example', Bcc: 'victim@example.com' }, attachments: [{ filename: 'x.exe', content: 'x' }] }
    await verifyTools(mail, 'sender-1').send(message)
    expect(send).toHaveBeenCalledWith({ sender_address_id: 'sender-1', to: 'check-1@verify.example', subject: 'Test', text: 'Hello', html: '<p>Hello</p>' })
  })

  it('sends to one recipient only', async () => {
    const { mail, send } = mailbox()
    for (const to of ['a@example.com, b@example.com', 'a@example.com\r\nBcc: b@example.com', 'not an address']) await expect(verifyTools(mail, 'sender-1').send({ to, subject: 'Test', text: 'Hello' })).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('sends once per verify', async () => {
    const { mail, send } = mailbox()
    const tools = verifyTools(mail, 'sender-1')
    await tools.send({ to: 'check-1@verify.example', subject: 'Test', text: 'Hello' })
    await expect(tools.send({ to: 'check-2@verify.example', subject: 'Test', text: 'Hello' })).rejects.toThrow('one test message')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
