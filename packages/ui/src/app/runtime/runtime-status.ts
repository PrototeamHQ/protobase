import { isApiError, type RuntimePolicy, type RuntimeStatus } from '@protobase/client'
import { formatDateTime } from '../../format/date'

/** The top bar shows the update button only when there is an update and the endpoint wants it shown. */
export const showsUpdateButton = (status: RuntimeStatus | undefined) => Boolean(status?.updateAvailable && status.indicator)

const policyLabels: Record<RuntimePolicy, string> = {
  immediate: 'Updates as soon as a release is out',
  weekly: 'Updates at a set time every week',
  scheduled: 'Updates at the time set for this release',
  manual: 'Updates only when asked to',
}

/** When the latest version will be applied on its own, in words. */
export const nextUpdateText = (status: RuntimeStatus) => {
  if (status.updating) return 'Updating now'
  if (status.nextUpdateAt) return `${policyLabels[status.policy]}: next on ${formatDateTime(Date.parse(status.nextUpdateAt))} UTC`
  return policyLabels[status.policy]
}

/** Why "Update now" failed, in words. */
export const updateErrorText = (error: unknown) => {
  if (isApiError(error) && error.status === 409) return 'Already on the latest version, or an update is running.'
  if (isApiError(error) && error.status === 403) return 'Only an admin can update the runtime.'
  return 'The update could not be started. Try again later.'
}
