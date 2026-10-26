import { afterEach, describe, expect, it, vi } from 'vitest'
import { startupLogger } from './startup-logger'

afterEach(() => {
  vi.restoreAllMocks()
})

const evaluationError = 'Error when evaluating SSR module /entry.ts: No authenticator\n    at entry.ts:20:9'

describe('startupLogger', () => {
  it("leaves out Vite's report of the entry failing at startup, whose error the CLI prints itself", () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { logger } = startupLogger()
    logger.error(evaluationError)
    expect(printed).not.toHaveBeenCalled()
    logger.error('Pre-transform error: Failed to resolve import')
    expect(printed).toHaveBeenCalledOnce()
  })

  it('reports a module that fails once the server has started', () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { logger, started } = startupLogger()
    started()
    logger.error(evaluationError)
    expect(printed).toHaveBeenCalledWith(expect.stringContaining('Error when evaluating SSR module'))
  })
})
