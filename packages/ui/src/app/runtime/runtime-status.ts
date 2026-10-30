import { isApiError, type RuntimeLastUpdate, type RuntimeStatus } from '@protobase/client'
import { formatAgo, formatDateTime } from '../../format/date'
import { viewerZone } from '../../format/zone'
import { text } from './messages'

/** The top bar shows the update button only when there is an update and the endpoint wants it shown. */
export const showsUpdateButton = (status: RuntimeStatus | undefined) => Boolean(status?.updateAvailable && status.indicator)

/** How often the status is read again: rarely, and every few seconds while an update runs so its progress shows. */
export const refreshMs = (updating: boolean) => (updating ? 5_000 : 30 * 60_000)

// The running update's stage and how long ago it started, when the endpoint names them; `now` in ms.
const runningText = (status: RuntimeStatus, now: number) => {
  if (!status.updateStage) return text('updatingNow')
  const label = text(status.updateStage)
  if (!status.updateStartedAt) return label
  const seconds = Math.max(0, Math.floor((now - Date.parse(status.updateStartedAt)) / 1000))
  return text('started', { stage: label, ago: formatAgo(seconds) })
}

/** How far the running update is, or when the latest version will be applied on its own, in words; `now` in ms. */
export const nextUpdateText = (status: RuntimeStatus, now = Date.now(), zone = viewerZone()) => {
  if (status.updating) return runningText(status, now)
  if (status.nextUpdateAt) return text('nextOn', { policy: text(status.policy), when: formatDateTime(Date.parse(status.nextUpdateAt), zone) })
  return text(status.policy)
}

/** How the last update ended, in words, with the endpoint's message for the owner when it has one. */
export const lastUpdateText = (last: RuntimeLastUpdate, zone = viewerZone()) => {
  const when = formatDateTime(Date.parse(last.finishedAt), zone)
  const headline = text(last.outcome, { version: last.toVersion, when })
  return last.message ? `${headline}: ${last.message}` : `${headline}.`
}

/** Why "Update now" failed, in words: the endpoint's own message for a refusal, when it sends one. */
export const updateErrorText = (error: unknown) => {
  if (isApiError(error) && error.status < 500 && error.problem.detail) return error.problem.detail
  if (isApiError(error) && error.status === 409) return text('alreadyLatest')
  if (isApiError(error) && error.status === 403) return text('onlyAdmin')
  return text('couldNotStart')
}
