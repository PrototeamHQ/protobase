import { ApiError, type RuntimeClient, type RuntimeStatus } from '@protobase/client'

const behind: RuntimeStatus = { version: '0.3.3', latest: '0.3.4', updateAvailable: true, indicator: true, policy: 'weekly', nextUpdateAt: '2026-10-12T03:00:00.000Z', updating: false }

/** A runtime endpoint in memory, for stories: one version behind; "Update now" starts an update, a second one is refused. */
export const fakeRuntime = (status: Partial<RuntimeStatus> = {}): RuntimeClient => {
  let current = { ...behind, ...status }
  return {
    status: async () => current,
    update: async () => {
      if (current.updating || !current.updateAvailable) throw new ApiError({ type: 'urn:protobase:problem:unknown', title: 'Conflict', status: 409 })
      current = { ...current, updating: true, nextUpdateAt: null }
      return current
    },
  }
}
