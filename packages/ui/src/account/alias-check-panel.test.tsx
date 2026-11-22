import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AliasCheckState } from './alias-check-run'
import { AliasCheckPanel, AliasCheckUnavailable } from './alias-check-panel'

const panel = (state: AliasCheckState, error?: string) =>
  renderToStaticMarkup(<AliasCheckPanel address="billing@shop.example" state={state} {...(error && { error })} onCheck={() => {}} />).replace(/&#x27;/g, "'")

const button = (html: string) => html.match(/<button[^>]*>(.*?)<\/button>/)?.[0]

describe('the From address check in its dialog', () => {
  it('offers to check an address not checked yet', () => {
    const html = panel({ status: 'idle' })
    expect(button(html)).toContain('Check address')
    expect(html).not.toContain('role="status"')
  })

  it('says it is waiting for the test message, busy until it arrives', () => {
    const html = panel({ status: 'waiting' })
    expect(html).toContain('Sending a test message from billing@shop.example to see which address it arrives from.')
    expect(button(html)).toMatch(/disabled="".*aria-busy="true"/)
  })

  it('confirms the address the message arrived from, and offers to check again', () => {
    const html = panel({ status: 'confirmed', from: 'billing@shop.example' })
    expect(html).toContain('The test message arrived from billing@shop.example. Your mailbox can send from this address.')
    expect(button(html)).toContain('Check again')
  })

  it('shows the address the mailbox used instead, as an alert, with how to fix it', () => {
    const html = panel({ status: 'mismatch', from: 'ana@gmail.example' })
    expect(html).toContain('role="alert"')
    expect(html).toContain("The test message arrived from ana@gmail.example instead of billing@shop.example. Set up and verify billing@shop.example under Send mail as in Gmail's settings, then check again.")
    expect(button(html)).toContain('Check again')
  })

  it('says when the message did not arrive in time', () => {
    const html = panel({ status: 'timed_out' })
    expect(html).toContain('The test message did not arrive within 2 minutes')
    expect(button(html)).toContain('Check again')
  })

  it('says plainly that the address stays unchecked where the app cannot check, with no button', () => {
    for (const html of [panel({ status: 'unchecked' }), renderToStaticMarkup(<AliasCheckUnavailable />)]) {
      expect(html).toContain('This app cannot check From addresses for you.')
      expect(button(html)).toBeUndefined()
    }
  })

  it('shows a failed request beside the button', () => {
    expect(panel({ status: 'idle' }, 'No answer came from the server')).toContain('role="alert" class="mb-3 text-body font-medium text-danger-text">No answer came from the server')
  })
})
