import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { AssistantOptions } from '../assistant/assistant-settings'
import { aiModel } from './ai-model'
import { hasAiActions, hasAiFields } from './ai-fields'

export type CheckAiInput = {
  models: readonly ResourceModel[]
  views: readonly ViewModel[]
  /** The project's `options.assistant`, whose model settings AI fields and actions use. */
  assistant: AssistantOptions | false | undefined
  env: Record<string, string | undefined>
}

/** Fails when a resource has an AI field or a view an AI action and no model is set to fill or run them. */
export const checkAi = ({ models, views, assistant, env }: CheckAiInput) => {
  if (!hasAiFields(models) && !hasAiActions(views)) return
  if (aiModel(assistant, env)) return
  throw new Error('AI fields and actions need a model: set PROTOBASE_ASSISTANT_API_KEY (and PROTOBASE_ASSISTANT_MODEL when PROTOBASE_ASSISTANT_BASE_URL is not OpenRouter), or options.assistant.apiKey')
}
