import { describe, expect, it, vi } from 'vitest'
import { gmailSendScope } from './gmail'
import { gmailSendAsUrl, gmailSettingsScope, listGmailSenderAddresses } from './gmail-sender-addresses'
import { accessNotConfigured, insufficientScope, invalidCredentials, json, sendAsList } from './gmail-responses'
import { PersonalMailError } from './personal-mail-error'
import { SenderListingError } from './personal-mail-provider'

const connection = { accessToken: 'access-1', scopes: [gmailSendScope, gmailSettingsScope] }

const answering = (response: () => Response) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response())

describe('listGmailSenderAddresses', () => {
  it('lists the primary and accepted aliases as verified, a pending one as pending, and any other status as no claim', async () => {
    const fetcher = answering(() => json(sendAsList))
    expect(await listGmailSenderAddresses(fetcher as typeof fetch, connection)).toEqual({
      kind: 'listed',
      addresses: [
        { address: 'ana@acme.example', provider_state: 'verified' },
        { address: 'billing@acme.example', provider_state: 'verified' },
        { address: 'sales@acme.example', provider_state: 'pending' },
        { address: 'old@acme.example' },
      ],
    })
    expect(fetcher).toHaveBeenCalledWith(gmailSendAsUrl, { headers: { authorization: 'Bearer access-1' } })
  })

  it('makes no claim for an alias without a status or with an unknown one', async () => {
    const fetcher = answering(() => json({ sendAs: [{ sendAsEmail: 'a@acme.example' }, { sendAsEmail: 'b@acme.example', verificationStatus: 'ACCEPTED' }, { sendAsEmail: 'c@acme.example', verificationStatus: '' }] }))
    const listing = await listGmailSenderAddresses(fetcher as typeof fetch, connection)
    expect(listing).toEqual({ kind: 'listed', addresses: [{ address: 'a@acme.example' }, { address: 'b@acme.example' }, { address: 'c@acme.example' }] })
  })

  it('answers not_permitted with the scope it lacks, without asking Gmail, for a link without a listing scope', async () => {
    const fetcher = answering(() => json(sendAsList))
    expect(await listGmailSenderAddresses(fetcher as typeof fetch, { accessToken: 'access-1', scopes: [gmailSendScope] })).toEqual({ kind: 'not_permitted', missing_scopes: [gmailSettingsScope] })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('lists with a broader scope the link holds for another reason', async () => {
    const fetcher = answering(() => json(sendAsList))
    expect((await listGmailSenderAddresses(fetcher as typeof fetch, { accessToken: 'a', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] })).kind).toBe('listed')
  })

  it('answers not_permitted when Google refuses the scope it holds', async () => {
    const fetcher = answering(() => json(insufficientScope, 403, 'Forbidden'))
    expect(await listGmailSenderAddresses(fetcher as typeof fetch, connection)).toEqual({ kind: 'not_permitted', missing_scopes: [gmailSettingsScope] })
  })

  it('rejects with link_expired on a refused token, never an empty listing', async () => {
    const fetcher = answering(() => json(invalidCredentials, 401, 'Unauthorized'))
    await expect(listGmailSenderAddresses(fetcher as typeof fetch, connection)).rejects.toEqual(new PersonalMailError('link_expired', 'gmail'))
  })

  it('rejects any other refusal, a body that is not a list, a page token or an entry that is not an address as incomplete', async () => {
    const bodies = [
      () => json(accessNotConfigured, 403, 'Forbidden'),
      () => json({ error: 'down' }, 500, 'Internal Server Error'),
      () => new Response('<html>', { status: 200 }),
      () => json({}),
      () => json({ sendAs: [], nextPageToken: 'p2' }),
      () => json({ sendAs: [{ sendAsEmail: 'billing@acme.example\r\nBcc: x@evil.example', verificationStatus: 'accepted' }] }),
      () => json({ sendAs: [{ displayName: 'nobody' }] }),
    ]
    for (const body of bodies) await expect(listGmailSenderAddresses(answering(body) as typeof fetch, connection)).rejects.toBeInstanceOf(SenderListingError)
  })

  it('rejects as a listing error when Gmail cannot be reached', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(listGmailSenderAddresses(fetcher as typeof fetch, connection)).rejects.toBeInstanceOf(SenderListingError)
  })
})
