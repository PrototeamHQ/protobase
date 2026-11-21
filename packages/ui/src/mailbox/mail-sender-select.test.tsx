import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { Router } from '../app/router'
import { MailSenderChoices } from './mail-sender-select'
import type { SenderOption } from './sender-options'

const sendFrom: FieldModel = { name: 'send_from', column: 'send_from', type: 'mail_sender', nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [] }
const options: SenderOption[] = [{ address: 'ana@gmail.example' }, { address: 'billing@acme.example', name: 'Acme billing' }]

const choices = (value: string, given: { options?: SenderOption[]; error?: string } = { options }, field = sendFrom) =>
  renderToStaticMarkup(
    <Router initialUrl="/clients/1">
      <MailSenderChoices field={field} value={value} onChange={() => {}} {...given} />
    </Router>,
  )

const optionTexts = (html: string) => [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((match) => match[1])

describe('a mail sender dropdown', () => {
  it("offers the person's addresses with their names after the default", () => {
    const html = choices('billing@acme.example')
    expect(optionTexts(html)).toEqual(["Sender&#x27;s default address", 'ana@gmail.example', 'Acme billing &lt;billing@acme.example&gt;'])
    expect(html).toContain('<option value="billing@acme.example" selected="">')
  })

  it('selects a stored address spelled in another case as the one offered', () => {
    expect(choices('Billing@Acme.example')).toContain('<option value="billing@acme.example" selected="">')
  })

  it('keeps a stored address the person cannot send from, marked not available and not invalid, with a way to add it', () => {
    const html = choices('old@acme.example')
    expect(optionTexts(html)).toEqual(["Sender&#x27;s default address", 'old@acme.example (not available)', 'ana@gmail.example', 'Acme billing &lt;billing@acme.example&gt;'])
    expect(html).toContain('<option value="old@acme.example" selected="">')
    expect(html).not.toContain('aria-invalid')
    expect(html).toContain('href="/-/account"')
  })

  it('shows the stored address alone, unmarked and disabled, while the addresses are read', () => {
    const html = choices('billing@acme.example', {})
    expect(optionTexts(html)).toEqual(["Sender&#x27;s default address", 'billing@acme.example'])
    expect(html).toContain('disabled=""')
  })

  it('asks for a choice on a required field without a value, and says why the list is empty when reading failed', () => {
    const html = choices('', { error: 'Could not read your From addresses' }, { ...sendFrom, nullable: false })
    expect(optionTexts(html)).toEqual(['Choose an address'])
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('disabled=""')
  })
})
