/** What the workflows do when an account of a connection is linked or disconnected, and which accounts their triggers wait on. */
export type ConnectionListener = {
  /** An account was linked again: the triggers waiting on its sign-in poll again. */
  linked: (accountId: string) => Promise<void>
  /** An account was disconnected: the triggers on it wait for a new sign-in. */
  disconnected: (accountId: string) => Promise<void>
  /** The accounts among `accountIds` that a trigger waits on to be signed in again. */
  needsSignIn: (accountIds: string[]) => Promise<string[]>
}

/**
 * The listener sign-in tells of connections, which the workflows set once they are made, after the auth instance;
 * until then, and in an app without workflows, nothing listens.
 */
export const connectionEvents = () => {
  let listener: ConnectionListener | undefined
  return {
    set: (next: ConnectionListener) => void (listener = next),
    linked: async (accountId: string) => listener?.linked(accountId),
    disconnected: async (accountId: string) => listener?.disconnected(accountId),
    needsSignIn: async (accountIds: string[]) => (listener && accountIds.length > 0 ? listener.needsSignIn(accountIds) : []),
  }
}

export type ConnectionEvents = ReturnType<typeof connectionEvents>
