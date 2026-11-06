import { ConnectionError, type TriggerContext } from '@protobase/workflows/plugin'
import { pluginFetch } from '../plugin-fetch'

/** The longest a plugin's error message is kept on its trigger, which the workflow's readers see. */
const messageLength = 1_000

/** What a plugin's trigger code gave: its value, its expired sign-in, or its error, as the trigger records it. */
export type PluginOutcome<T> = { value: T } | { expired: string } | { failed: string }

/**
 * Runs a plugin's trigger code: any error it throws is the plugin's, which the trigger records rather than the job
 * retrying it; a `ConnectionError('link_expired')` is a sign-in to renew. The message goes through `redact` and is cut
 * to 1 000 characters, since the trigger's readers see it.
 */
export const callPlugin = <T>(work: () => Promise<T>, redact: (text: string) => string): Promise<PluginOutcome<T>> =>
  Promise.resolve()
    .then(work)
    .then(
      (value) => ({ value }),
      (error: unknown) => {
        const message = redact(error instanceof Error ? error.message : String(error)).slice(0, messageLength)
        if (error instanceof ConnectionError && error.code === 'link_expired') return { expired: message }
        return { failed: message }
      },
    )

/**
 * `redact` after blanking out `values` that only this call knew, such as a webhook's URL key and secret, as written and
 * URL-encoded, so a message that quotes them keeps neither.
 */
export const redactAlso = (values: readonly string[], redact: (text: string) => string) => {
  const blanked = [...new Set(values.flatMap((value) => [value, encodeURIComponent(value)]))].filter((value) => value.length > 0)
  return (text: string) => redact(blanked.reduce((kept, value) => kept.replaceAll(value, '[redacted]'), text))
}

export type TriggerContextInput = { allowPrivateAddresses: boolean }

/**
 * What a trigger's hooks get: its input, the guarded `fetch`, and the job's signal, which aborts at its timeout. No
 * type that needs a connection runs yet, so it has none.
 */
export const triggerContext = ({ allowPrivateAddresses }: TriggerContextInput, input: Record<string, unknown>, signal: AbortSignal): TriggerContext => ({
  input,
  connection: undefined,
  fetch: pluginFetch({ allowPrivateAddresses }),
  signal,
})
