import type { Db } from '@protobase/query'
import type { Meta } from '../meta'
import type { Authenticator, Session } from '../types'
import { appContext } from './app-context'
import { openRouterUrl, seesAssistant } from './assistant-settings'
import type { ModelSettings } from './chat-completions'
import { conversationKey, createConversations } from './conversations'
import { fileConversationStore } from './file-conversation-store'
import { assistantProtocolRoutes } from './protocol-routes'
import { readOnlyQueryTool, readWriteQueryTool } from './query-tools'
import type { ToolRecords } from './records'
import type { AssistantTool } from './tools'
import { runTurn } from './turn'

export type BuiltInAssistantInput = {
  model: ModelSettings
  chats: string
  db: Db
  meta: Meta
  authenticate: Authenticator
  /** The app's own tools, offered after the built-in ones. */
  tools?: AssistantTool[]
  /** What tools get as `records` for the session of a turn. */
  records?: (session: Session) => ToolRecords
  report?: (error: unknown) => void
}

// The names model endpoints accept for a function.
const toolName = /^[A-Za-z0-9_-]{1,64}$/

/** The tools in order; a name a model endpoint refuses, or one taken twice, stops the server at startup. */
const checkedTools = (tools: AssistantTool[]) => {
  const seen = new Set<string>()
  for (const tool of tools) {
    if (!toolName.test(tool.name)) throw new Error(`Assistant tool name "${tool.name}" must be 1 to 64 letters, digits, _ or -`)
    if (seen.has(tool.name)) throw new Error(`Two assistant tools are named "${tool.name}"; give one of them another name`)
    seen.add(tool.name)
  }
  return tools
}

const pageContext = (page: string | undefined) => page && `The user is on the page ${page} of the app (/<resource> lists records, /<resource>/<key> shows one).`

/**
 * Protobase's own assistant: answers questions about the app, reads its data with read-only queries and proposes
 * changes the user approves, with the app's own tools besides, for callers with the `admin` or `ai` role. Made only of
 * the exported building blocks and its prompt, which describes what the caller may see of the app. Conversations are
 * files in the `chats` directory. On OpenRouter it caches the prompt and asks for little reasoning.
 */
export const builtInAssistant = ({ model, chats, db, meta, authenticate, tools: appTools = [], records, report }: BuiltInAssistantInput) => {
  const conversations = createConversations({ store: fileConversationStore(chats) })
  const tools = checkedTools([readOnlyQueryTool(db), readWriteQueryTool(db), ...appTools])
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
        ...(records && { records: records(session) }),
        report,
        ...(page && { context: pageContext(page) }),
        ...(onOpenRouter && { cache: true, reasoning: 'low' as const }),
      }, text)
    },
  })
}
