import { describe, expect, it } from 'vitest'
import { ApiError } from '@protobase/client'
import { mailboxProblem } from './mailbox-problem'

// As the server's PersonalMailError answers, a 409 problem with its code and provider.
const problem = (slug: string, extras: Record<string, string> = {}) =>
  new ApiError({ type: `urn:protobase:problem:${slug}`, title: 'Conflict', status: 409, detail: 'Link a mailbox to send mail from it', ...extras })

describe('mailboxProblem', () => {
  it('reads a missing mailbox', () => {
    expect(mailboxProblem(problem('personal-mail-not-linked', { code: 'not_linked' }))).toEqual({ code: 'not_linked' })
  })

  it('reads an expired link with its provider', () => {
    expect(mailboxProblem(problem('personal-mail-link-expired', { code: 'link_expired', provider: 'gmail' }))).toEqual({ code: 'link_expired', provider: 'gmail' })
  })

  it('finds none in a failure that is not about the mailbox', () => {
    expect(mailboxProblem(problem('send-failed'))).toBeUndefined()
    expect(mailboxProblem(problem('constructor'))).toBeUndefined()
    expect(mailboxProblem(new Error('Network down'))).toBeUndefined()
  })
})
