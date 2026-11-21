import type { MergedConfig } from './merge-config'

/** Whether the app takes its mail's bounces and complaints: the one reading of `mailFeedback`, which takes only true or false. */
export const mailFeedbackOn = (config: Pick<MergedConfig, 'mailFeedback'>) => {
  const value: unknown = config.mailFeedback
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`mailFeedback is ${JSON.stringify(value)}; it takes true or false`)
  return value === true
}
