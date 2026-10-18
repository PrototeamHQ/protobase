import { describe, expect, it } from 'vitest'
import { mentionEmail } from './mention-email'

const app = { name: 'Helpdesk', url: 'https://desk.example.com/' }

describe('the mention email', () => {
  it('names the author and the record, quotes the comment whole and links the record', async () => {
    const url = 'https://desk.example.com/tickets/12'
    const email = await mentionEmail.render({ app, author: 'Ann de Vries', record: 'Ticket: Printer on fire', body: 'Can you look, @Bo?\nIt smokes.', url })
    expect(email.subject).toBe('Ann de Vries mentioned you on Ticket: Printer on fire')
    expect(email.html).toContain(`href="${url}"`)
    expect(email.html).toContain('href="https://desk.example.com/"')
    expect(email.text).toContain('Ann de Vries mentioned you in a comment on Ticket: Printer on fire in Helpdesk:')
    expect(email.text).toContain('Can you look, @Bo?\nIt smokes.')
    expect(email.text).toContain(`Open Ticket: Printer on fire ${url}`)
    expect(email.text).toContain('Reply in the app, not to this email.')
  })
})
