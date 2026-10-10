import { describe, expect, it } from 'vitest'
import { ApiError, type RuntimeStatus } from '@protobase/client'
import { nextUpdateText, showsUpdateButton, updateErrorText } from './runtime-status'

const status: RuntimeStatus = { version: '0.3.3', latest: '0.3.4', updateAvailable: true, indicator: true, policy: 'weekly', nextUpdateAt: '2026-10-12T03:00:00.000Z', updating: false }

it('shows the button only for an available update the endpoint wants shown', () => {
  expect(showsUpdateButton(status)).toBe(true)
  expect(showsUpdateButton({ ...status, indicator: false })).toBe(false)
  expect(showsUpdateButton({ ...status, updateAvailable: false })).toBe(false)
  expect(showsUpdateButton(undefined)).toBe(false)
})

describe('nextUpdateText', () => {
  it('names the policy and when it applies the latest version', () => {
    expect(nextUpdateText(status)).toBe('Updates at a set time every week: next on 12 Oct 2026, 03:00 UTC')
    expect(nextUpdateText({ ...status, policy: 'manual', nextUpdateAt: null })).toBe('Updates only when asked to')
    expect(nextUpdateText({ ...status, updating: true })).toBe('Updating now')
  })
})

it('updateErrorText: a conflict, a refusal, anything else', () => {
  const problem = (code: number) => new ApiError({ type: 'urn:protobase:problem:unknown', title: 'Failed', status: code })
  expect(updateErrorText(problem(409))).toBe('Already on the latest version, or an update is running.')
  expect(updateErrorText(problem(403))).toBe('Only an admin can update the runtime.')
  expect(updateErrorText(new TypeError('Failed to fetch'))).toBe('The update could not be started. Try again later.')
})
