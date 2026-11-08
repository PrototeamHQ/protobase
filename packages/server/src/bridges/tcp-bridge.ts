import { bridgeTokenParam } from '@protobase/schema/internal'
import type { FunctionContext, FunctionHandler } from '../functions/define-function'
import { readJson } from '../functions/read-json'
import { sameCaller } from '../functions/same-caller'
import { badRequest, forbidden, HttpProblem, notFound } from '../problem'
import { bridgeAttempts, type BridgeAttempt } from './bridge-attempts'
import { bridgeClosings } from './bridge-closings'
import { checkedTarget, type BridgeTarget } from './bridge-target'
import { bridgeTokens, type BridgeGrant } from './bridge-tokens'
import { connectTcp } from './tcp-connect'
import { tcpPipe } from './tcp-pipe'

/**
 * The app's access rule: where the caller may bridge to for the target name a client asks for, such as a server's
 * record key, or `undefined` when they may not. It runs when a token is asked for, when the bridge opens and every
 * minute while it is open.
 */
export type BridgeRule = (target: string, context: FunctionContext) => BridgeTarget | undefined | Promise<BridgeTarget | undefined>

export type TcpBridgeOptions = {
  target: BridgeRule
  now?: () => number
}

/** A function handler that bridges WebSockets to TCP, and closes the bridges to a target at once, open or still being set up (`withdraw`). */
export type TcpBridge = FunctionHandler & { withdraw: (target: string) => void }

const isTokenRequest = (body: unknown): body is { target: string } =>
  typeof body === 'object' && body !== null && typeof (body as { target?: unknown }).target === 'string' && (body as { target: string }).target !== ''

const noSuchTarget = () => notFound('There is no such target, or you may not reach it')
const noSuchToken = () => notFound('There is no such bridge token: ask for a new one')
const withdrawn = () => forbidden('target-withdrawn', bridgeClosings.withdrawn.reason)

/**
 * A bridge from a signed-in user's browser to a TCP service the server can reach, such as one on the workspace's
 * private network, as a function's handler: `export default defineFunction(tcpBridge({ target }))`.
 *
 * - `POST` with `{ "target": "…" }` asks the access rule and answers `{ token, open_by, expires_at }`, or a 404 problem.
 * - A WebSocket upgrade with `?token=` before `open_by`, by the same caller, connects to the target and passes binary
 *   messages through as bytes. A token opens one bridge only, which closes at `expires_at`, when the rule refuses
 *   again or answers another address, on `withdraw`, or as any function socket does once the caller is refused. One
 *   that expires or is withdrawn while it is still being set up never opens.
 */
export const tcpBridge = ({ target: rule, now = Date.now }: TcpBridgeOptions): TcpBridge => {
  const tokens = bridgeTokens({ now })
  const attempts = bridgeAttempts()

  const resolve = async (name: string, context: FunctionContext) => {
    const answer = await rule(name, context)
    return answer === undefined ? undefined : checkedTarget(name, answer)
  }

  const issue = async (request: Request, context: FunctionContext) => {
    const body = await readJson(request)
    if (!isTokenRequest(body)) throw badRequest('invalid-body', 'Send { "target": "…" } as application/json')
    const target = await resolve(body.target, context)
    if (!target) throw noSuchTarget()
    const expiresAt = now() + target.seconds * 1000
    const { token, openBy } = tokens.issue({ caller: context.session, target: body.target, host: target.host, port: target.port, expiresAt })
    return Response.json({ token, open_by: new Date(openBy).toISOString(), expires_at: new Date(expiresAt).toISOString() }, { status: 201 })
  }

  // Still the same address for the same caller; a changed one is withdrawn, so the bridge never moves to another service.
  const stillAllowed = async (grant: BridgeGrant, context: FunctionContext) => {
    const target = await resolve(grant.target, context)
    return target !== undefined && target.host === grant.host && target.port === grant.port
  }

  // Why a bridge still being set up may not go on, checked again after each wait, as its token's own check would refuse it.
  const lateRefusal = (grant: BridgeGrant, attempt: BridgeAttempt) => {
    if (attempt.withdrawn()) return withdrawn()
    if (grant.expiresAt <= now()) return noSuchToken()
  }

  const connectGranted = async (grant: BridgeGrant, context: FunctionContext, attempt: BridgeAttempt) => {
    if (!(await stillAllowed(grant, context))) throw withdrawn()
    const refusedEarly = lateRefusal(grant, attempt)
    if (refusedEarly) throw refusedEarly
    const tcp = await connectTcp(grant.host, grant.port)
    const refused = lateRefusal(grant, attempt)
    if (!refused) return tcp
    tcp.destroy()
    throw refused
  }

  const bridge = async (request: Request, context: FunctionContext) => {
    const token = new URL(request.url).searchParams.get(bridgeTokenParam)
    const grant = token ? tokens.take(token) : undefined
    if (!grant || !sameCaller(grant.caller, context.session) || grant.expiresAt <= now()) throw noSuchToken()
    const attempt = attempts.start(grant.target)
    // Until the connection exists, a refusal or a failed connection ends the attempt; from then on the connection's close does.
    const tcp = await connectGranted(grant, context, attempt).catch((error: unknown) => {
      attempt.end()
      throw error
    })
    tcp.once('close', attempt.end)
    let expiry: ReturnType<typeof setTimeout> | undefined
    const pipe = tcpPipe(tcp, {
      onOpen: (socket) => {
        expiry = setTimeout(() => socket.close(bridgeClosings.expired.code, bridgeClosings.expired.reason), grant.expiresAt - now())
        attempt.opened(socket)
      },
      onClose: () => clearTimeout(expiry),
    })
    return context.acceptWebSocket({
      ...pipe,
      recheck: async () => {
        if (!(await stillAllowed(grant, context))) throw withdrawn()
      },
    })
  }

  const handler: FunctionHandler = (request, context) => {
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return bridge(request, context)
    if (request.method === 'POST') return issue(request, context)
    throw new HttpProblem(405, 'method-not-allowed', 'Method Not Allowed', 'Ask for a token with POST, then open the bridge with a WebSocket', {}, { allow: 'GET, POST' })
  }

  return Object.assign(handler, { withdraw: attempts.withdraw })
}
