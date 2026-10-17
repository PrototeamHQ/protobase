import { describe, expect, it } from 'vitest'
import { ApiError, type RuntimeLastUpdate, type RuntimeStatus } from '@protobase/client'
import { lastUpdateText, nextUpdateText, refreshMs, showsUpdateButton, updateErrorText } from './runtime-status'

const status: RuntimeStatus = { version: '0.3.3', latest: '0.3.4', updateAvailable: true, indicator: true, policy: 'weekly', nextUpdateAt: '2026-10-12T03:00:00.000Z', updating: false }

it('shows the button only for an available update the endpoint wants shown', () => {
  expect(showsUpdateButton(status)).toBe(true)
  expect(showsUpdateButton({ ...status, indicator: false })).toBe(false)
  expect(showsUpdateButton({ ...status, updateAvailable: false })).toBe(false)
  expect(showsUpdateButton(undefined)).toBe(false)
})

it('reads the status every few seconds while an update runs, every half hour otherwise', () => {
  expect(refreshMs(true)).toBe(5_000)
  expect(refreshMs(false)).toBe(30 * 60_000)
})

describe('nextUpdateText', () => {
  it('names the policy and when it applies the latest version', () => {
    expect(nextUpdateText(status)).toBe('Updates at a set time every week: next on 12 Oct 2026, 03:00 UTC')
    expect(nextUpdateText({ ...status, policy: 'manual', nextUpdateAt: null })).toBe('Updates only when asked to')
  })

  it("names the running update's stage and how long ago it started, when the endpoint sends them", () => {
    const now = Date.parse('2026-10-12T03:03:20.000Z')
    const running = { ...status, updating: true, updateStartedAt: '2026-10-12T03:00:00.000Z' }
    expect(nextUpdateText({ ...running, updateStage: 'job' }, now)).toBe('Preparing the update, started 3 min ago')
    expect(nextUpdateText({ ...running, updateStage: 'build' }, now)).toBe('Building, started 3 min ago')
    expect(nextUpdateText({ ...running, updateStage: 'build', updateStartedAt: null }, now)).toBe('Building')
    expect(nextUpdateText({ ...status, updating: true }, now)).toBe('Updating now')
  })
})

it("lastUpdateText: the outcome, the version and the endpoint's message", () => {
  const last: RuntimeLastUpdate = { toVersion: '0.19.1', outcome: 'failed', errorCode: 'doctor_failed', message: "The app's config does not pass protobase doctor with the release", finishedAt: '2026-10-12T03:07:00.000Z' }
  expect(lastUpdateText(last)).toBe("The update to 0.19.1 failed on 12 Oct 2026, 03:07 UTC: The app's config does not pass protobase doctor with the release")
  expect(lastUpdateText({ ...last, message: null })).toBe('The update to 0.19.1 failed on 12 Oct 2026, 03:07 UTC.')
  expect(lastUpdateText({ ...last, outcome: 'succeeded', errorCode: null, message: null })).toBe('Updated to 0.19.1 on 12 Oct 2026, 03:07 UTC.')
  expect(lastUpdateText({ ...last, outcome: 'unchanged', errorCode: null, message: null })).toBe('The update to 0.19.1 on 12 Oct 2026, 03:07 UTC changed nothing.')
})

it("updateErrorText: the endpoint's message, else a conflict, a refusal, anything else", () => {
  const problem = (code: number, detail?: string) => new ApiError({ type: 'urn:protobase:problem:unknown', title: 'Failed', status: code, detail })
  expect(updateErrorText(problem(409, "An update of the app's runtime is running"))).toBe("An update of the app's runtime is running")
  expect(updateErrorText(problem(409))).toBe('Already on the latest version, or an update is running.')
  expect(updateErrorText(problem(403))).toBe('Only an admin can update the runtime.')
  expect(updateErrorText(problem(500, 'Something went wrong'))).toBe('The update could not be started. Try again later.')
  expect(updateErrorText(new TypeError('Failed to fetch'))).toBe('The update could not be started. Try again later.')
})
