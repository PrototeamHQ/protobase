import { badRequest } from '../../problem'
import type { PipelineHook } from '../../types'
import { runnersResource } from './registration'

const label = /^[a-z0-9][a-z0-9_.:-]{0,49}$/

/**
 * Checks a runner's labels on every create and update, a list of at most 20 of lowercase letters, digits and `_.:-`,
 * and refuses taking a revoke back: a revoked runner's token stays refused, so another machine registers as a new one.
 */
export const runnerSaveHook: PipelineHook = async (event) => {
  if (event.resource.name !== runnersResource || !event.after) return
  if (event.operation !== 'create' && event.operation !== 'update') return
  const { labels } = event.after
  if (!Array.isArray(labels) || labels.length > 20 || !labels.every((one) => typeof one === 'string' && label.test(one))) {
    throw badRequest('invalid-runner', 'labels is a list of at most 20 labels, each lowercase letters, digits and "_.:-", such as ["gpu"]', { errors: [{ code: 'invalid-runner', field: 'labels', message: 'is a list of at most 20 labels, such as ["gpu"]' }] })
  }
  if (event.operation === 'update' && event.before?.revoked === true && event.after.revoked !== true) {
    throw badRequest('runner-revoked', 'A revoked runner stays revoked; make a new runner to register the machine again', { errors: [{ code: 'runner-revoked', field: 'revoked', message: 'cannot be taken back' }] })
  }
}
