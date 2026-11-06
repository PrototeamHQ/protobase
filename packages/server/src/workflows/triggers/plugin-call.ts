import { ConnectionError, type PluginConnection, type TriggerContext } from '@protobase/workflows/plugin'
import { pluginFetch } from '../plugin-fetch'

/** The longest a plugin's error message is kept on its trigger, which the workflow's readers see. */
const messageLength = 1_000

/**
 * What a plugin's trigger code gave: its value, its expired sign-in, or its error, as the trigger records it, with
 * `unconnected` set when the error is that its workflow may use no connection any more (`not_connected`).
 */
export type PluginOutcome<T> = { value: T } | { expired: string } | { failed: string; unconnected?: true }

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
        if (error instanceof ConnectionError && error.code === 'not_connected') return { failed: message, unconnected: true as const }
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

/** The trigger a hook runs for: its type, and the workflow version it runs, none once its workflow was deleted. */
export type TriggerRef = { type: string; input: Record<string, unknown>; workflow_id: string | null; version: number }

/** The connection a trigger's type declared, bound by its workflow, which hands each token it gives to `secret`; none for a type without one. */
export type TriggerConnect = (trigger: TriggerRef, secret: (token: string) => void) => PluginConnection | undefined

export type TriggerContextInput = { allowPrivateAddresses: boolean; connect?: TriggerConnect }

/**
 * What one call of a trigger's hook gets: its input, its connection, the guarded `fetch`, and the job's signal, which
 * aborts at its timeout; and `redact` for its outcome, which also blanks out each token its connection gave this call.
 */
export const triggerCall = ({ allowPrivateAddresses, connect }: TriggerContextInput, trigger: TriggerRef, signal: AbortSignal, redact: (text: string) => string) => {
  const issued: string[] = []
  const context: TriggerContext = {
    input: trigger.input,
    connection: connect?.(trigger, (token) => void issued.push(token)),
    fetch: pluginFetch({ allowPrivateAddresses }),
    signal,
  }
  return { context, redact: (text: string) => redactAlso(issued, redact)(text) }
}
