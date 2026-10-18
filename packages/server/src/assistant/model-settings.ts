import { checkedUrl } from '../checked-url'
import type { ModelSettings } from './chat-completions'

/** The environment variables of the model settings, which `options.assistant`'s keys of the same name win over. */
export const modelVariables = {
  apiKey: 'PROTOBASE_ASSISTANT_API_KEY',
  model: 'PROTOBASE_ASSISTANT_MODEL',
  baseUrl: 'PROTOBASE_ASSISTANT_BASE_URL',
} as const

export const openRouterUrl = 'https://openrouter.ai/api/v1'
export const openRouterModel = 'openrouter/auto'

/** The model part of `options.assistant`; `fetch` replaces the model endpoint, for tests. */
export type ModelOptions = { apiKey?: string; model?: string; baseUrl?: string; fetch?: typeof fetch }

/**
 * The chat model an API key gives, the option over its environment variable: OpenRouter unless `baseUrl` names another
 * OpenAI-compatible endpoint, which then needs a `model`; none without a key. A value that cannot work throws.
 */
export const modelSettings = (option: ModelOptions | undefined, env: Record<string, string | undefined>): ModelSettings | undefined => {
  const value = (key: keyof typeof modelVariables) => (option?.[key] ?? env[modelVariables[key]])?.trim() || undefined
  const source = (key: keyof typeof modelVariables) => (option?.[key] === undefined ? modelVariables[key] : `options.assistant.${key}`)

  const apiKey = value('apiKey')
  if (!apiKey) return undefined
  const baseUrl = checkedUrl(value('baseUrl') ?? openRouterUrl, source('baseUrl'))
  const model = value('model') ?? (baseUrl === openRouterUrl ? openRouterModel : undefined)
  if (!model) throw new Error(`${modelVariables.model} (or options.assistant.model) is required with an endpoint other than OpenRouter's`)
  return { baseUrl, apiKey, model, ...(option?.fetch && { fetch: option.fetch }) }
}
