import { defineTool } from '../../assistant/tools'
import type { Session } from '../../types'

type Connection = { key: string; label: string; accounts: { id: string; scopes: string[]; needs_sign_in: boolean }[] }

/** The session's own person's connections, each with their accounts that fit it, such as `auth.connections.list`. */
export type ListConnections = (session: Session) => Promise<Connection[]>

/**
 * The caller's own accounts, by connection, which a definition's `connections` binds by id. Each field is picked one by
 * one, so nothing more than the list reads leaves, and never a token; it takes no argument, so it lists no one else's.
 */
export const listConnectionsTool = (list: ListConnections | undefined) => defineTool({
  name: 'list_connections',
  description: 'Lists the connections the app\'s workflow plugins declare with your own connected accounts, as JSON ({ connections }), each with its key, label and accounts, each account with its id, scopes and needs_sign_in. A workflow binds an account in its definition\'s connections, as { "<key>": "<account id>" }; an account is connected, or connected again when it needs a sign-in, on the account page.',
  parameters: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_args, context) => {
    const connections = list ? await list(context.session) : []
    return JSON.stringify({
      connections: connections.map(({ key, label, accounts }) => ({ key, label, accounts: accounts.map(({ id, scopes, needs_sign_in }) => ({ id, scopes, needs_sign_in })) })),
    })
  },
})
