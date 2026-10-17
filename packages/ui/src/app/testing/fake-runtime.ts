import { ApiError, type RuntimeClient, type RuntimeStatus } from '@protobase/client'

const behind: RuntimeStatus = { version: '0.3.3', latest: '0.3.4', updateAvailable: true, indicator: true, policy: 'weekly', nextUpdateAt: '2026-10-12T03:00:00.000Z', updating: false }

/** A runtime endpoint in memory, for stories: one version behind; "Update now" starts an update, a second one is refused. */
export const fakeRuntime = (status: Partial<RuntimeStatus> = {}): RuntimeClient => {
  let current = { ...behind, ...status }
  return {
    status: async () => current,
    update: async () => {
      if (current.updating) throw new ApiError({ type: 'urn:protobase:problem:update_running', title: 'Conflict', status: 409, detail: "An update of the app's runtime is running" })
      if (!current.updateAvailable) throw new ApiError({ type: 'urn:protobase:problem:up_to_date', title: 'Conflict', status: 409, detail: 'The app runs the latest release' })
      current = { ...current, updating: true, updateStage: 'job', updateStartedAt: new Date().toISOString(), nextUpdateAt: null }
      return current
    },
  }
}
