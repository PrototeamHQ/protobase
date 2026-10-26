import { createLogger } from 'vite'

/**
 * Vite's logger for `protobase dev`. Vite logs a module that fails to evaluate, with its stack, before
 * `ssrLoadModule` throws the error. The first load is the startup check, whose error the CLI prints as one line, so
 * Vite's copy is left out until `started`; a module that fails while the server runs still shows Vite's stack.
 */
export const startupLogger = () => {
  const logger = createLogger()
  const error = logger.error
  let starting = true
  logger.error = (message, options) => {
    if (starting && message.includes('Error when evaluating SSR module')) return
    error(message, options)
  }
  return {
    logger,
    started: () => {
      starting = false
    },
  }
}
