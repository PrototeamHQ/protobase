import { describe, expect, it } from 'vitest'
import { createSigner } from './signer'
import { issueTicket, readTicket } from './ticket'

const signer = createSigner('a-test-secret')
const scope = { tenant: '1', resource: 'products', field: 'image', user: 'u1' }
const ref = { provider: 'private', path: '1/2992db9c-776e-4d4e-9e0f-59d485fefaf9.jpg', name: 'bike red.png', size: 48211 }
const clean = 'private:1/2992db9c-776e-4d4e-9e0f-59d485fefaf9.jpg?name=bike+red.png&size=48211'

describe('upload tickets', () => {
  it('give back the clean URI and the derived values for their scope', async () => {
    const ticket = await issueTicket(signer, ref, { image_width: 6000, image_ratio: '1.5000' }, scope, 2000)
    expect(ticket.startsWith(`${clean}&d.image_ratio=`)).toBe(true)
    expect(await readTicket(signer, ticket, scope, 1000)).toEqual({ ok: true, uri: clean, ref, derived: { image_width: 6000, image_ratio: '1.5000' } })
  })

  it('carry the variants stored with the file, signed with the rest', async () => {
    const withVariants = { ...ref, variants: { card: 'webp' } }
    const ticket = await issueTicket(signer, withVariants, { image_placeholder: 'YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw' }, scope, 2000)
    expect(await readTicket(signer, ticket, scope, 1000)).toEqual({ ok: true, uri: `${clean}&variants=card.webp`, ref: withVariants, derived: { image_placeholder: 'YJqGPQw7sFlslqhFafSE+Q6oJ1h2iHB2Rw' } })
    expect(await readTicket(signer, ticket.replace('card.webp', 'card.avif'), scope, 1000)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuse another tenant, user, resource or field, an edit, and a key from another secret', async () => {
    const ticket = await issueTicket(signer, ref, { image_width: 6000 }, scope, 2000)
    for (const other of [{ tenant: '2' }, { user: 'u2' }, { resource: 'orders' }, { field: 'datasheet' }]) {
      expect(await readTicket(signer, ticket, { ...scope, ...other }, 1000)).toEqual({ ok: false, reason: 'invalid' })
    }
    expect(await readTicket(signer, ticket.replace('size=48211', 'size=1'), scope, 1000)).toEqual({ ok: false, reason: 'invalid' })
    expect(await readTicket(signer, ticket.replace('d.image_width=6000', 'd.image_width=1'), scope, 1000)).toEqual({ ok: false, reason: 'invalid' })
    expect(await readTicket(signer, ticket.replace('/2992db9c', '/3992db9c'), scope, 1000)).toEqual({ ok: false, reason: 'invalid' })
    expect(await readTicket(createSigner('another-secret'), ticket, scope, 1000)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('expire, and tell a plain value from a ticket', async () => {
    const ticket = await issueTicket(signer, ref, {}, scope, 2000)
    expect(await readTicket(signer, ticket, scope, 2001)).toEqual({ ok: false, reason: 'expired' })
    expect(await readTicket(signer, clean, scope, 1000)).toEqual({ ok: false, reason: 'not-a-ticket' })
    expect(await readTicket(signer, 'public:images/test.jpg', scope, 1000)).toEqual({ ok: false, reason: 'not-a-ticket' })
  })
})
