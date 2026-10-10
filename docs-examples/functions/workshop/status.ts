import { badRequest } from '@protobase/server'

// A repair's way through the workshop; a ready one is the front desk's.
const steps = ['waiting', 'working', 'ready']

export const nextStatus = (status: string) => {
  const at = steps.indexOf(status)
  if (at < 0 || at === steps.length - 1) throw badRequest('not-in-workshop', `A ${status} repair is not in the workshop`)
  return steps[at + 1]!
}
