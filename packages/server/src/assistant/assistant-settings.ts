import { checkedUrl } from '../checked-url'
import type { ModelSettings } from './chat-completions'
import { modelSettings, modelVariables } from './model-settings'
import type { AssistantTool } from './tools'

/**
 * `url`: an assistant backend elsewhere, which the dock talks to instead of the built-in one.
 * `apiKey`, `model`, `baseUrl`: the built-in assistant, which answers questions about the app with a chat model.
 * `chats`: the directory the built-in assistant keeps conversations in, one file each.
 * Each falls back to its environment variable; `fetch` replaces the model endpoint, for tests.
 * `tools`: the app's own tools, which the built-in assistant offers after its own; a backend elsewhere has its own.
 */
export type AssistantOptions = { url?: string; apiKey?: string; model?: string; baseUrl?: string; chats?: string; fetch?: typeof fetch; tools?: AssistantTool[] }

export type AssistantSettings = { kind: 'external'; url: string } | { kind: 'built-in'; model: ModelSettings; chats: string }

export const assistantVariables = {
  url: 'PROTOBASE_ASSISTANT_URL',
  ...modelVariables,
  chats: 'PROTOBASE_ASSISTANT_CHATS',
} as const

/** Where the built-in assistant keeps conversations without `chats`: relative to the working directory. */
export const defaultChatsDirectory = '.protobase/chats'

/** The roles that see the assistant: `/meta` names it, and the built-in one answers, only for a caller with one of them. */
export const assistantRoles = ['admin', 'ai'] as const

export const seesAssistant = (roles: readonly string[]) => assistantRoles.some((role) => roles.includes(role))


/**
 * Which assistant the app has: the backend at `url` when one is set, otherwise the built-in one when an API key is
 * set, otherwise none (also when the option is `false`). The built-in one calls OpenRouter unless `baseUrl` names
 * another OpenAI-compatible endpoint, which then needs a `model`. A value that cannot work stops the server at startup.
 */
export const assistantSettings = (option: AssistantOptions | false | undefined, env: Record<string, string | undefined>): AssistantSettings | undefined => {
  if (option === false) return undefined
  const value = (key: 'url' | 'chats') => (option?.[key] ?? env[assistantVariables[key]])?.trim() || undefined
  const source = (key: 'url') => (option?.[key] === undefined ? assistantVariables[key] : `options.assistant.${key}`)

  const url = value('url')
  if (url) return { kind: 'external', url: checkedUrl(url, source('url')) }
  const model = modelSettings(option, env)
  return model && { kind: 'built-in', model, chats: value('chats') ?? defaultChatsDirectory }
}
