import { describe, expect, it } from 'vitest'
import { commentLines, mentionEmail } from './mention-email'

const app = { name: 'Helpdesk', url: 'https://desk.example.com/' }

describe('the mention email', () => {
  it('names the author and the record, quotes the comment whole, a line each, and links the record', async () => {
    const url = 'https://desk.example.com/tickets/12'
    const email = await mentionEmail.render({ author: 'Ann de Vries', record: 'Ticket: Printer on fire', lines: commentLines('Can you look, @Bo?\nIt smokes.'), url }, { app })
    expect(email.subject).toBe('Ann de Vries mentioned you on Ticket: Printer on fire')
    expect(email.html).toContain(`href="${url}"`)
    expect(email.html).toContain('href="https://desk.example.com/"')
    expect(email.text).toContain('Ann de Vries mentioned you in a comment on Ticket: Printer on fire in Helpdesk:')
    expect(email.text).toMatch(/Can you look, @Bo\?\n+It smokes\./)
    expect(email.text).toContain(`Open Ticket: Printer on fire ${url}`)
    expect(email.text).toContain('Reply in the app, not to this email.')
  })

  it('comes in Dutch for a Dutch reader', async () => {
    const email = await mentionEmail.render({ author: 'Ann', record: 'Ticket 12', lines: commentLines('Kijk je even?'), url: 'https://desk.example.com/tickets/12' }, { app, locale: 'nl' })
    expect(email.subject).toBe('Ann heeft je genoemd bij Ticket 12')
    expect(email.text).toContain('Ticket 12 openen https://desk.example.com/tickets/12')
  })
})
