import { HttpProblem } from '../problem'

export type RecheckOptions = {
  /** Resolves while the caller may keep the socket; a 401, 403 or 404 problem when they would be refused now. */
  check: () => Promise<unknown>
  close: (code: number, reason: string) => void
  report: (error: unknown) => void
  everyMs?: number
}

const refusals = new Set([401, 403, 404])
const isRefusal = (error: unknown): error is HttpProblem => error instanceof HttpProblem && refusals.has(error.status)

/**
 * Runs `check` every `everyMs` while a socket is open, one check after the other. A refusal, such as a record the caller
 * can no longer see (404), closes the socket with 1008 (Policy Violation) and the problem's title; any other error is
 * reported and closes it with 1011, so an outage that stops the check ends the access too. A check still pending after
 * another `everyMs` counts as such an error, so a hung store never leaves a socket open unchecked. Returns the function
 * that stops it.
 */
export const recheckWhileOpen = ({ check, close, report, everyMs = 60_000 }: RecheckOptions) => {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const end = (error: unknown) => {
    if (stopped) return
    stopped = true
    if (isRefusal(error)) return close(1008, error.title)
    report(error)
    close(1011, 'Internal Error')
  }
  const run = () => {
    timer = setTimeout(() => end(new Error(`A socket's check did not finish within ${everyMs} ms`)), everyMs)
    ;(timer as { unref?: () => void }).unref?.()
    check().then(() => {
      clearTimeout(timer)
      if (!stopped) schedule()
    }, end)
  }
  const schedule = () => {
    timer = setTimeout(run, everyMs)
    ;(timer as { unref?: () => void }).unref?.()
  }
  schedule()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
