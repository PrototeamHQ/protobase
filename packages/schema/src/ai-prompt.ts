import { hrefPlaceholders } from './address-template'

const placeholder = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/** The fields an AI prompt reads from the record, from its `{field}` placeholders. */
export const promptFields = (prompt: string) => hrefPlaceholders(prompt)

const asText = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  return JSON.stringify(value)
}

/** `prompt` with every `{field}` replaced by the record's value as text; a missing value becomes empty, json as JSON. */
export const renderPrompt = (prompt: string, record: Record<string, unknown>) =>
  prompt.replace(placeholder, (_, name: string) => asText(record[name]))

/** Why a prompt cannot be an AI field's or action's: it reads no field of the record. */
export const promptError = (prompt: string) => (promptFields(prompt).length === 0 ? 'its prompt must name at least one {field} of the record' : undefined)
