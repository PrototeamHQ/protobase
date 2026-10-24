import { StaleJobError } from '../jobs/job-progress'

/** A device or history store method that failed while sending: it names the method and at most a SQLSTATE. */
export class NotificationStoreError extends Error {
  constructor(readonly method: string, readonly code?: string) {
    super(`The notifications store's ${method} failed${code ? ` (${code})` : ''}`)
  }
}

const sqlStatePattern = /^[0-9A-Z]{5}$/

const codeOf = (error: unknown) => {
  const { sqlState, code } = (typeof error === 'object' && error !== null ? error : {}) as { sqlState?: unknown; code?: unknown }
  const found = [sqlState, code].find((value) => typeof value === 'string' && sqlStatePattern.test(value))
  return found as string | undefined
}

/**
 * Calls a store method for the send job. Whatever it throws becomes a `NotificationStoreError` with no cause: an app's
 * own store may throw a driver error whose message or detail holds a token or key, and the job keeps its error. A try
 * that no longer holds its job stops as it is.
 */
export const storeCall = async <T>(method: string, call: () => Promise<T>): Promise<T> => {
  try {
    return await call()
  } catch (error) {
    if (error instanceof StaleJobError) throw error
    throw new NotificationStoreError(method, codeOf(error))
  }
}
