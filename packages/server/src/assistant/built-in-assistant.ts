import type { Db } from '@protobase/query'
import type { Meta } from '../meta'
import type { Authenticator } from '../types'
import { appContext } from './app-context'
import { seesAssistant, type ModelSettings } from './assistant-settings'
import { conversationKey, createConversations } from './conversations'
import { assistantProtocolRoutes } from './protocol-routes'
import { readOnlyQueryTool, readWriteQueryTool } from './query-tools'
import { runTurn } from './turn'

export type BuiltInAssistantInput = { model: ModelSettings; db: Db; meta: Meta; authenticate: Authenticator; report?: (error: unknown) => void }

/**
 * Protobase's own assistant: answers questions about the app, reads its data with read-only queries and proposes
 * changes the user approves, for callers with the `admin` or `ai` role. Made only of the exported building blocks and
 * its prompt, which describes what the caller may see of the app.
 */
export const builtInAssistant = ({ model, db, meta, authenticate, report }: BuiltInAssistantInput) => {
  const conversations = createConversations()
  const tools = [readOnlyQueryTool(db), readWriteQueryTool(db)]
  return assistantProtocolRoutes({
    authenticate,
    allows: (session) => seesAssistant(session.user.roles),
    conversationOf: (session) => conversations(conversationKey(session)),
    report,
    onMessage: async (text, session, conversation) => {
      const { body } = await meta.forCaller(session)
      await runTurn({ model, conversation, session, system: appContext(body.resources, body.views), tools, report }, text)
    },
  })
}
