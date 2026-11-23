import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MailSenderVerification } from '@protobase/client'
import type { VerificationState } from './verification-run'
import { VerificationPanel, VerificationUnavailable } from './verification-panel'

const panel = (state: VerificationState, error?: string) =>
  renderToStaticMarkup(<VerificationPanel address="billing@shop.example" state={state} {...(error && { error })} onVerify={() => {}} />).replace(/&#x27;/g, "'")

const button = (html: string) => html.match(/<button[^>]*>(.*?)<\/button>/)?.[0]

const settled = (...verifications: MailSenderVerification[]): VerificationState => ({ status: 'settled', verifications })

describe('the From address verification in its dialog', () => {
  it('offers to verify an address not verified yet', () => {
    const html = panel({ status: 'idle' })
    expect(button(html)).toContain('Verify address')
    expect(html).not.toContain('role="status"')
  })

  it('says it is verifying, busy until it settles', () => {
    const html = panel({ status: 'pending' })
    expect(html).toContain('Verifying billing@shop.example.')
    expect(button(html)).toMatch(/disabled="".*aria-busy="true"/)
  })

  it('says when the address is verified, and offers to verify again', () => {
    const html = panel(settled({ verifier: 'test-mail', state: 'verified', validUntil: '2026-10-30T00:00:00.000Z' }))
    expect(html).toContain('billing@shop.example is verified: mail from it goes out from this address.')
    expect(button(html)).toContain('Verify again')
  })

  it("shows a failure as an alert, with the verifier's own text as plain text", () => {
    const error = '<script>alert(1)</script>"><img src=x onerror=alert(2)>'
    const html = panel(settled({ verifier: 'test-mail', state: 'failed', errorCode: 'from_rewritten', error }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('billing@shop.example could not be verified.')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;&lt;img src=x onerror=alert(2)&gt;')
  })

  it("words the app's own failures itself", () => {
    expect(panel(settled({ verifier: 'test-mail', state: 'failed', errorCode: 'verification_expired' }))).toContain('The verification of billing@shop.example did not finish in time.')
    expect(panel(settled({ verifier: 'test-mail', state: 'failed', errorCode: 'verifier_error' }))).toContain("The verification of billing@shop.example did not work on the app's side.")
  })

  it('says when it has not finished in time', () => {
    const html = panel({ status: 'timed_out' })
    expect(html).toContain('The verification has not finished yet.')
    expect(button(html)).toContain('Verify again')
  })

  it('says plainly that the app cannot verify addresses, with no button', () => {
    const html = renderToStaticMarkup(<VerificationUnavailable />)
    expect(html).toContain('This app cannot verify From addresses for you.')
    expect(button(html)).toBeUndefined()
  })

  it('shows a failed request beside the button', () => {
    expect(panel({ status: 'idle' }, 'No answer came from the server')).toContain('role="alert" class="mb-3 text-body font-medium text-danger-text">No answer came from the server')
  })
})
