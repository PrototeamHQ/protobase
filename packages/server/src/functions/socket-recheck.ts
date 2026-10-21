import { HttpProblem } from '../problem'

export type RecheckOptions = {
  /** Resolves while the caller may keep the socket; a 401 or 403 problem when they would be refused now. */
  check: () => Promise<unknown>
  close: (code: number, reason: string) => void
  report: (error: unknown) => void
  everyMs?: number
}

const isRefusal = (error: unknown): error is HttpProblem => error instanceof HttpProblem && (error.status === 401 || error.status === 403)

/**
 * Runs `check` every `everyMs` while a socket is open, one check after the other. A refusal closes the socket with 1008
 * (Policy Violation) and the problem's title; any other error is reported and closes it with 1011, so an outage that
 * stops the check ends the access too. Returns the function that stops it.
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
  const run = () =>
    check().then(() => {
      if (!stopped) schedule()
    }, end)
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
