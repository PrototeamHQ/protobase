import { describe, expect, it, vi } from 'vitest'
import { mailSenderUseCheck } from './mail-sender-use-check'

describe('mailSenderUseCheck', () => {
  it('lets every address go until the app gives where records hold them', async () => {
    await expect(mailSenderUseCheck().refuse('billing@acme.example', 'en')).resolves.toBeUndefined()
  })

  it('refuses an address records hold, in the language asked for, naming no records', async () => {
    const check = mailSenderUseCheck()
    const find = vi.fn(async () => true)
    check.set(find)
    await expect(check.refuse('billing@acme.example', 'en')).rejects.toMatchObject({
      statusCode: 409,
      body: { code: 'MAIL_SENDER_IN_USE', message: 'billing@acme.example is still the From address of records in this app. Give them another From address first.' },
    })
    await expect(check.refuse('billing@acme.example', 'nl')).rejects.toMatchObject({
      body: { code: 'MAIL_SENDER_IN_USE', message: 'billing@acme.example is nog het afzenderadres van records in deze app. Geef ze eerst een ander afzenderadres.' },
    })
    expect(find).toHaveBeenCalledWith('billing@acme.example')
  })

  it('lets an address no record holds go', async () => {
    const check = mailSenderUseCheck()
    check.set(async () => false)
    await expect(check.refuse('billing@acme.example', 'en')).resolves.toBeUndefined()
  })
})
