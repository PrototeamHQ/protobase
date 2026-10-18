import { isApiError, type RuntimeLastUpdate, type RuntimePolicy, type RuntimeStatus, type RuntimeUpdateStage } from '@protobase/client'
import { formatAgo, formatDateTime } from '../../format/date'
import { viewerZone } from '../../format/zone'

/** The top bar shows the update button only when there is an update and the endpoint wants it shown. */
export const showsUpdateButton = (status: RuntimeStatus | undefined) => Boolean(status?.updateAvailable && status.indicator)

/** How often the status is read again: rarely, and every few seconds while an update runs so its progress shows. */
export const refreshMs = (updating: boolean) => (updating ? 5_000 : 30 * 60_000)

const policyLabels: Record<RuntimePolicy, string> = {
  immediate: 'Updates as soon as a release is out',
  weekly: 'Updates at a set time every week',
  scheduled: 'Updates at the time set for this release',
  manual: 'Updates only when asked to',
}

const stageLabels: Record<RuntimeUpdateStage, string> = {
  job: 'Preparing the update',
  build: 'Building',
}

// The running update's stage and how long ago it started, when the endpoint names them; `now` in ms.
const runningText = (status: RuntimeStatus, now: number) => {
  if (!status.updateStage) return 'Updating now'
  const label = stageLabels[status.updateStage]
  if (!status.updateStartedAt) return label
  const seconds = Math.max(0, Math.floor((now - Date.parse(status.updateStartedAt)) / 1000))
  return `${label}, started ${formatAgo(seconds)}`
}

/** How far the running update is, or when the latest version will be applied on its own, in words; `now` in ms. */
export const nextUpdateText = (status: RuntimeStatus, now = Date.now(), zone = viewerZone()) => {
  if (status.updating) return runningText(status, now)
  if (status.nextUpdateAt) return `${policyLabels[status.policy]}: next on ${formatDateTime(Date.parse(status.nextUpdateAt), zone)}`
  return policyLabels[status.policy]
}

/** How the last update ended, in words, with the endpoint's message for the owner when it has one. */
export const lastUpdateText = (last: RuntimeLastUpdate, zone = viewerZone()) => {
  const when = formatDateTime(Date.parse(last.finishedAt), zone)
  const headline = {
    succeeded: `Updated to ${last.toVersion} on ${when}`,
    unchanged: `The update to ${last.toVersion} on ${when} changed nothing`,
    failed: `The update to ${last.toVersion} failed on ${when}`,
  }[last.outcome]
  return last.message ? `${headline}: ${last.message}` : `${headline}.`
}

/** Why "Update now" failed, in words: the endpoint's own message for a refusal, when it sends one. */
export const updateErrorText = (error: unknown) => {
  if (isApiError(error) && error.status < 500 && error.problem.detail) return error.problem.detail
  if (isApiError(error) && error.status === 409) return 'Already on the latest version, or an update is running.'
  if (isApiError(error) && error.status === 403) return 'Only an admin can update the runtime.'
  return 'The update could not be started. Try again later.'
}
