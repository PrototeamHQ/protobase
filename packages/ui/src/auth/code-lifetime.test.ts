import { emailCodeMinutes, locales } from '@protobase/schema/internal'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { setAppLocale } from '../locale/active-locale'
import { catalogues, messages } from '../locale/messages'
import { EmailCodeForm } from './email-code-form'
import { SignUpCodeForm } from './sign-up-code-form'
import { TwoFactorForm } from './two-factor-form'

afterEach(() => setAppLocale(undefined))

// Every text that says how long an emailed code works, by area and id.
const lifetimeTexts = [
  ['auth', 'signInCodeSent'],
  ['auth', 'signUpCodeSent'],
  ['auth', 'otpInstruction'],
  ['account', 'codeSentTo'],
] as const

const noop = () => {}

describe('the emailed code lifetime on the page', () => {
  it('takes the minutes from the value, in every language', () => {
    for (const locale of locales) {
      setAppLocale(locale)
      for (const [namespace, id] of lifetimeTexts) {
        const source = (catalogues[locale][namespace] as Record<string, string>)[id]!
        expect(source, `${locale} ${namespace}.${id}`).toContain('{minutes, plural,')
        expect(source, `${locale} ${namespace}.${id}`).not.toMatch(/\d+ minu/)
        const text = messages(namespace) as (id: string, values: Record<string, string | number>) => string
        expect(text(id, { email: 'ada@example.com', minutes: 7 })).toMatch(/\b7 minu/)
      }
    }
  })

  it('states the minutes the server expires the code by, on each code step', () => {
    const minutes = `${emailCodeMinutes} minutes`
    const steps = [
      createElement(EmailCodeForm, { email: 'ada@example.com', onSubmit: noop, onResend: noop, onBack: noop }),
      createElement(SignUpCodeForm, { email: 'ada@example.com', onSubmit: noop, onResend: noop, onBack: noop }),
      createElement(TwoFactorForm, { methods: ['otp'], onVerify: noop, onSendCode: noop, onBack: noop, codeSent: true, initialStep: 'otp' }),
    ]
    for (const step of steps) expect(renderToStaticMarkup(step)).toContain(minutes)
  })
})
