import type { Db } from '@protobase/query'
import type { Meta } from '../meta'
import type { Authenticator } from '../types'
import { appContext } from './app-context'
import { openRouterUrl, seesAssistant, type ModelSettings } from './assistant-settings'
import { conversationKey, createConversations } from './conversations'
import { fileConversationStore } from './file-conversation-store'
import { assistantProtocolRoutes } from './protocol-routes'
import { readOnlyQueryTool, readWriteQueryTool } from './query-tools'
import { runTurn } from './turn'

export type BuiltInAssistantInput = { model: ModelSettings; chats: string; db: Db; meta: Meta; authenticate: Authenticator; report?: (error: unknown) => void }

const pageContext = (page: string | undefined) => page && `The user is on the page ${page} of the app (/<resource> lists records, /<resource>/<key> shows one).`

/**
 * Protobase's own assistant: answers questions about the app, reads its data with read-only queries and proposes
 * changes the user approves, for callers with the `admin` or `ai` role. Made only of the exported building blocks and
 * its prompt, which describes what the caller may see of the app. Conversations are files in the `chats` directory.
 * On OpenRouter it caches the prompt and asks for little reasoning.
 */
export const builtInAssistant = ({ model, chats, db, meta, authenticate, report }: BuiltInAssistantInput) => {
  const conversations = createConversations({ store: fileConversationStore(chats) })
  const tools = [readOnlyQueryTool(db), readWriteQueryTool(db)]
  const onOpenRouter = model.baseUrl === openRouterUrl
  return assistantProtocolRoutes({
    authenticate,
    allows: (session) => seesAssistant(session.user.roles),
    conversationOf: (session) => conversations(conversationKey(session)),
    report,
    onMessage: async ({ text, page }, session, conversation) => {
      const { body } = await meta.forCaller(session)
      await runTurn({
        model,
        conversation,
        session,
        system: appContext(body.resources, body.views),
        tools,
        report,
        ...(page && { context: pageContext(page) }),
        ...(onOpenRouter && { cache: true, reasoning: 'low' as const }),
      }, text)
    },
  })
}
