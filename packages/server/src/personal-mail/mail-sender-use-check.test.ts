import { describe, expect, it, vi } from 'vitest'
import { mailSenderUseCheck } from './mail-sender-use-check'
import { viewNames } from './view-names'
import type { ViewModel } from '@protobase/schema'

const views = [{ resource: 'clients', names: { singular: 'client', plural: 'clients' } }] as ViewModel[]

describe('mailSenderUseCheck', () => {
  it('lets every address go until the app gives where records hold them', async () => {
    await expect(mailSenderUseCheck().refuse('billing@acme.example')).resolves.toBeUndefined()
  })

  it('refuses an address records hold, naming each resource and how many by their view names', async () => {
    const check = mailSenderUseCheck()
    const find = vi.fn(async () => [{ resource: 'clients', count: 1 }, { resource: 'quotes', count: 3 }])
    check.set(find, viewNames(views))
    await expect(check.refuse('billing@acme.example')).rejects.toMatchObject({
      statusCode: 409,
      body: { code: 'MAIL_SENDER_IN_USE', message: 'billing@acme.example is the From address of 1 client, 3 quotes: choose another address there first.' },
    })
    expect(find).toHaveBeenCalledWith('billing@acme.example')
  })

  it('lets an address no record holds go', async () => {
    const check = mailSenderUseCheck()
    check.set(async () => [], viewNames(views))
    await expect(check.refuse('billing@acme.example')).resolves.toBeUndefined()
  })
})
