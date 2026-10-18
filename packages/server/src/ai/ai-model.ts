import type { AssistantOptions } from '../assistant/assistant-settings'
import { modelSettings } from '../assistant/model-settings'

/**
 * The model AI fields and actions call: the assistant's, also when `url` names a chat backend elsewhere (it replaces the
 * chat, not the model) and when the option is `false` (which turns off the chat only).
 */
export const aiModel = (option: AssistantOptions | false | undefined, env: Record<string, string | undefined>) =>
  modelSettings(option === false ? undefined : option, env)
