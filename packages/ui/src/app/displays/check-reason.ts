import { isApiError } from '@protobase/client'
import { formatText, messageParts } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { text } from './messages'

// The codes the API's field errors use themselves; any other code of a record's error names a database check
const builtInCodes = ['required', 'invalid-value', 'read-only', 'unknown-field', 'invalid-record']

/**
 * Why a database check the config declares refused a write of `record`: its label from `/meta`, in the reader's
 * language, its `{field}` values filled from `record`, as the app has it. A check no resource of `resources` declares
 * gives the generic refusal; any other error gives undefined.
 */
export const checkReason = (error: unknown, resources: readonly ResourceModel[], record: Record<string, unknown>, locale: string) => {
  if (!isApiError(error) || error.slug !== 'invalid-record') return undefined
  const code = error.errors.find((entry) => entry.field === '_record' && entry.code !== undefined && !builtInCodes.includes(entry.code))?.code
  if (code === undefined) return undefined
  const label = resources.find((model) => Object.hasOwn(model.checks ?? {}, code))?.checks?.[code]?.label
  if (label === undefined) return text('checkRefused')
  const values = Object.fromEntries(messageParts(label, locale).values.map((name) => [name, String(record[name] ?? '')]))
  return formatText({ locale, messages: { label } }, 'label', values)
}
