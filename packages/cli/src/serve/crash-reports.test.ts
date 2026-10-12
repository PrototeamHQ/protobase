import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { reportCrashes } from './crash-reports'

const crashingProcess = () => Object.assign(new EventEmitter(), { exit: vi.fn() })

describe('reportCrashes', () => {
  it('reports an uncaught exception or unhandled rejection, then exits with 1 once it is sent', async () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const event of ['uncaughtException', 'unhandledRejection']) {
      let sent = (_: boolean) => {}
      const reporter = { report: vi.fn(), flush: vi.fn(() => new Promise<boolean>((resolve) => (sent = resolve))) }
      const target = crashingProcess()
      reportCrashes(reporter, target, 500)
      const error = new Error(`${event} boom`)
      target.emit(event, error)
      expect(reporter.report).toHaveBeenCalledWith(error)
      expect(reporter.flush).toHaveBeenCalledWith(500)
      expect(printed).toHaveBeenCalledWith(error)
      await Promise.resolve()
      expect(target.exit).not.toHaveBeenCalled()
      sent(true)
      await vi.waitFor(() => expect(target.exit).toHaveBeenCalledWith(1))
    }
    printed.mockRestore()
  })
})
