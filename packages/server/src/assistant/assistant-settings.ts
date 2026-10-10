/** An OpenAI-compatible chat completions endpoint for the built-in assistant. */
export type ModelSettings = { baseUrl: string; apiKey: string; model: string; fetch?: typeof fetch }

/**
 * `url`: an assistant backend elsewhere, which the dock talks to instead of the built-in one.
 * `apiKey`, `model`, `baseUrl`: the built-in assistant, which answers questions about the app with a chat model.
 * `chats`: the directory the built-in assistant keeps conversations in, one file each.
 * Each falls back to its environment variable; `fetch` replaces the model endpoint, for tests.
 */
export type AssistantOptions = { url?: string; apiKey?: string; model?: string; baseUrl?: string; chats?: string; fetch?: typeof fetch }

export type AssistantSettings = { kind: 'external'; url: string } | { kind: 'built-in'; model: ModelSettings; chats: string }

export const assistantVariables = {
  url: 'PROTOBASE_ASSISTANT_URL',
  apiKey: 'PROTOBASE_ASSISTANT_API_KEY',
  model: 'PROTOBASE_ASSISTANT_MODEL',
  baseUrl: 'PROTOBASE_ASSISTANT_BASE_URL',
  chats: 'PROTOBASE_ASSISTANT_CHATS',
} as const

/** Where the built-in assistant keeps conversations without `chats`: relative to the working directory. */
export const defaultChatsDirectory = '.protobase/chats'

export const openRouterUrl = 'https://openrouter.ai/api/v1'
export const openRouterModel = 'openrouter/auto'

/** The roles that see the assistant: `/meta` names it, and the built-in one answers, only for a caller with one of them. */
export const assistantRoles = ['admin', 'ai'] as const

export const seesAssistant = (roles: readonly string[]) => assistantRoles.some((role) => roles.includes(role))

/** `url` without a trailing slash; anything but an http(s) URL stops the server, naming `source`. */
export const checkedUrl = (url: string, source: string) => {
  if (!URL.canParse(url)) throw new Error(`${source} is not a URL; use https://...`)
  const { protocol } = new URL(url)
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`${source} must start with https:// or http://, not ${protocol}//`)
  return url.replace(/\/+$/, '')
}

/**
 * Which assistant the app has: the backend at `url` when one is set, otherwise the built-in one when an API key is
 * set, otherwise none (also when the option is `false`). The built-in one calls OpenRouter unless `baseUrl` names
 * another OpenAI-compatible endpoint, which then needs a `model`. A value that cannot work stops the server at startup.
 */
export const assistantSettings = (option: AssistantOptions | false | undefined, env: Record<string, string | undefined>): AssistantSettings | undefined => {
  if (option === false) return undefined
  const value = (key: keyof typeof assistantVariables) => {
    const given = option?.[key] ?? env[assistantVariables[key]]
    return given?.trim() || undefined
  }
  const source = (key: keyof typeof assistantVariables) => (option?.[key] === undefined ? assistantVariables[key] : `options.assistant.${key}`)

  const url = value('url')
  if (url) return { kind: 'external', url: checkedUrl(url, source('url')) }
  const apiKey = value('apiKey')
  if (!apiKey) return undefined
  const baseUrl = checkedUrl(value('baseUrl') ?? openRouterUrl, source('baseUrl'))
  const model = value('model') ?? (baseUrl === openRouterUrl ? openRouterModel : undefined)
  if (!model) throw new Error(`${assistantVariables.model} (or options.assistant.model) is required with an endpoint other than OpenRouter's`)
  return { kind: 'built-in', model: { baseUrl, apiKey, model, ...(option && option.fetch && { fetch: option.fetch }) }, chats: value('chats') ?? defaultChatsDirectory }
}
