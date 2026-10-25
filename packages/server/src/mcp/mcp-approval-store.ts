import { createRequestStateCodec, type ServerContext } from '@modelcontextprotocol/server'

/** How long an approval asked for can be answered: RFC 6749's longest life for a one-time code. */
export const approvalLifetime = 600_000

const purpose = 'mcp.approve'

type Payload = { purpose: typeof purpose; nonce: string; call: string; expiresAt: number }
type Issued = { call: string; expiresAt: number }

/** An approval asked for: the `requestState` the client echoes with the answer, and the nonce the answer is filed under. */
export type AskedApproval = { state: string; nonce: string }

/**
 * The approvals an MCP server asked for and has not had answered: `ask` mints the state for the call `call` hashes to,
 * in the scope `scope` hashes to, and `check` takes an echoed state back once, resolving to its nonce only when this
 * store minted it for that very call and scope, it is unexpired and no other check took it first.
 */
export type McpApprovals = {
  ask: (scope: string, call: string) => Promise<AskedApproval>
  check: (scope: string, call: string, state: unknown) => Promise<string | undefined>
}

export type ApprovalStoreInput = {
  /** The HMAC key, at least 32 bytes. */
  key: Uint8Array
  now?: () => number
  /** How many approvals one scope may have waiting; past it, the scope's oldest is dropped. */
  perScope?: number
  /** How many may wait in all; past it, a new ask fails rather than drop another scope's. */
  total?: number
}

const isPayload = (value: unknown): value is Payload => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { purpose: named, nonce, call, expiresAt } = value as Record<string, unknown>
  return named === purpose && typeof nonce === 'string' && nonce !== '' && typeof call === 'string' && /^[0-9a-f]{64}$/.test(call) && typeof expiresAt === 'number' && Number.isFinite(expiresAt)
}

const newNonce = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')

/** An approval store with the key given; `mcpApprovals` is the one a server uses. */
export const approvalStore = ({ key, now = () => Date.now(), perScope = 50, total = 10_000 }: ApprovalStoreInput): McpApprovals => {
  // The codec's own expiry, in whole seconds, outlasts `expiresAt`, which is the one that counts.
  const codec = createRequestStateCodec<unknown>({ key, ttlSeconds: approvalLifetime / 1000 })
  const scopes = new Map<string, Map<string, Issued>>()
  let waiting = 0

  const dropExpired = () => {
    const at = now()
    for (const [scope, issued] of scopes) {
      for (const [nonce, { expiresAt }] of issued) {
        if (expiresAt > at) continue
        issued.delete(nonce)
        waiting -= 1
      }
      if (issued.size === 0) scopes.delete(scope)
    }
  }

  const take = (scope: string, nonce: string) => {
    const issued = scopes.get(scope)
    const entry = issued?.get(nonce)
    if (!issued || !entry) return undefined
    issued.delete(nonce)
    waiting -= 1
    if (issued.size === 0) scopes.delete(scope)
    return entry
  }

  return {
    ask: async (scope, call) => {
      const nonce = newNonce()
      const expiresAt = now() + approvalLifetime
      const state = await codec.mint({ purpose, nonce, call, expiresAt } satisfies Payload)
      // From here to the end nothing awaits, so the limits hold however many asks run at once.
      dropExpired()
      if (waiting >= total) throw new Error('Too many approvals are waiting for an answer')
      const issued = scopes.get(scope) ?? new Map<string, Issued>()
      if (issued.size >= perScope) {
        issued.delete(issued.keys().next().value!)
        waiting -= 1
      }
      issued.set(nonce, { call, expiresAt })
      scopes.set(scope, issued)
      waiting += 1
      return { state, nonce }
    },
    check: async (scope, call, state) => {
      if (typeof state !== 'string') return undefined
      // The codec rejects every state it cannot vouch for, a bad MAC, an expired or a malformed one, and only with an
      // opaque reason: to the caller that is a state that does not count, which asks again. The codec binds nothing to
      // a context, so it reads none.
      const payload = await codec.verify(state, undefined as unknown as ServerContext).catch(() => undefined)
      if (!isPayload(payload)) return undefined
      // Taken at once after the last await, so of two checks of one state only the first gets it, whatever follows.
      const issued = take(scope, payload.nonce)
      if (!issued) return undefined
      if (issued.call !== call || payload.call !== call || payload.expiresAt !== issued.expiresAt) return undefined
      if (now() >= issued.expiresAt) return undefined
      return payload.nonce
    },
  }
}

/**
 * The approvals of an app's MCP endpoint: built once at startup, with a key of its own no one else holds, drawn when
 * it first asks, so a server that never asks draws nothing.
 */
export const mcpApprovals = (): McpApprovals => {
  let store: McpApprovals | undefined
  const opened = () => (store ??= approvalStore({ key: crypto.getRandomValues(new Uint8Array(32)) }))
  return {
    ask: (scope, call) => opened().ask(scope, call),
    // A state this store cannot have minted, as it has minted none.
    check: async (scope, call, state) => (store ? store.check(scope, call, state) : undefined),
  }
}
