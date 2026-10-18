import type { FieldModel } from '@protobase/schema'
import { promptFields, renderPrompt } from '@protobase/schema/internal'
import { openRouterUrl } from '../assistant/model-settings'
import { streamChatCompletion, type ModelSettings } from '../assistant/chat-completions'
import { isEmpty } from './values'

// The same for every call, so that the endpoint can cache it: what changes is in the user message.
const instruction = 'You write the value of one field of a record in a business app. Answer with the value only: no introduction, no quotes, no Markdown code fences.'

export type GenerateInput = {
  /** The prompt, with `{field}` placeholders. */
  prompt: string
  /** The record the placeholders are filled from. */
  record: Record<string, unknown>
  /** The field the value is for: an enum's answer is one of its values. */
  field: FieldModel
}

/**
 * The value the model writes for `field` from `prompt` filled with the record's values, trimmed; `null` when every field
 * the prompt reads is empty, without asking the model, or when the model answers nothing. Rejects with a `ModelError`.
 */
export const generateValue = async (settings: ModelSettings, { prompt, record, field }: GenerateInput, signal?: AbortSignal): Promise<string | null> => {
  if (promptFields(prompt).every((name) => isEmpty(record[name]))) return null
  const choices = field.type === 'enum' && field.enumValues ? `\n\nAnswer with exactly one of: ${field.enumValues.join(', ')}` : ''
  const messages = [
    { role: 'system' as const, content: instruction },
    { role: 'user' as const, content: `${renderPrompt(prompt, record)}${choices}` },
  ]
  const { content } = await streamChatCompletion(settings, messages, () => {}, { ...(signal && { signal }), ...(settings.baseUrl === openRouterUrl && { reasoning: 'low' as const }) })
  return content.trim() || null
}
