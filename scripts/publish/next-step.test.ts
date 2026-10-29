import { describe, expect, it } from 'vitest'
import { nextStep } from './next-step.mjs'

const tlogConflict = `npm error code TLOG_CREATE_ENTRY_ERROR
npm error error creating tlog entry - (409) an equivalent entry already exists in the transparency log with UUID 108e9186e8c5677a`
const identityToken = 'npm error code IDENTITY_TOKEN_READ_ERROR'
const forbidden = 'npm error code E403\nnpm error 403 You cannot publish over the previously published versions: 0.62.2.'

describe('nextStep', () => {
  it('counts a transparency log conflict as published when npm has the version', () => {
    expect(nextStep({ output: tlogConflict, attempt: 1, published: true })).toBe('published')
    expect(nextStep({ output: tlogConflict, attempt: 3, published: true })).toBe('published')
  })

  it('publishes again after a transparency log conflict when npm does not have the version, up to 3 times', () => {
    expect(nextStep({ output: tlogConflict, attempt: 1, published: false })).toBe('retry')
    expect(nextStep({ output: tlogConflict, attempt: 2, published: false })).toBe('retry')
    expect(nextStep({ output: tlogConflict, attempt: 3, published: false })).toBe('fail')
  })

  it('publishes again when npm could not read the identity token, up to 3 times', () => {
    expect(nextStep({ output: identityToken, attempt: 2 })).toBe('retry')
    expect(nextStep({ output: identityToken, attempt: 3 })).toBe('fail')
  })

  it('fails at once on any other error, whatever npm has', () => {
    expect(nextStep({ output: forbidden, attempt: 1 })).toBe('fail')
    expect(nextStep({ output: forbidden, attempt: 1, published: true })).toBe('fail')
    expect(nextStep({ output: 'npm error code TLOG_CREATE_ENTRY_ERROR\nnpm error (500) internal error', attempt: 1, published: true })).toBe('fail')
  })
})
