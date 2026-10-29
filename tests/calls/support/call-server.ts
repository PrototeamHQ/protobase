import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import type { Db } from '@protobase/query'
import { defineFunction, type CallsOptions, type FunctionRecords, type FunctionSocket } from '@protobase/server'
import { apiWebSocketServer } from '../../../packages/cli/src/project/api-websocket-server'
import type { CallsService } from '../../../packages/server/src/calls/calls-service-type'
import { callsRuntime } from '../../../packages/server/src/calls/calls-runtime'
import { createErrorHandler } from '../../../packages/server/src/error-handler'
import { functionRoutes } from '../../../packages/server/src/functions/routes'
import { notFound } from '../../../packages/server/src/problem'

export type CallServerInput = {
  calls: CallsOptions
  /** A database with the `calls` schema, which every server of a test shares, as processes share the app's. */
  db: Db
  page: { html: string; script: string }
}

/**
 * The function an app would write to admit members to the call on a meeting, served with the app's function routes:
 * the meeting is `?call=`, the member `?as=`, which stands in for the signed-in user; `?role=listener` may not
 * publish; `?hears=<member>` hears only that member's video. A member in `denied` cannot read any meeting, as after
 * their access was taken away. Every socket it accepts is kept, so a test can drop them as a deploy would.
 */
export const startCallServer = async ({ calls, db, page }: CallServerInput) => {
  const sockets = new Set<FunctionSocket>()
  const errors: unknown[] = []
  const denied = new Set<string>()
  const runtime = callsRuntime({ db, timeoutMs: 5000, options: calls, report: (error) => void errors.push(error) })
  const service: CallsService = { runtime: async () => runtime, recordOf: (resource, key) => ({ resource, key: String(key) }) }
  const meetings = (user: string) =>
    ({
      get: async (resource: string, key: unknown) => {
        if (denied.has(user)) throw notFound(`No ${resource} with this key`)
        return { record: { id: key }, etag: '1' }
      },
    }) as unknown as FunctionRecords
  const meeting = defineFunction(async (request, { session, acceptWebSocket, calls: access }) => {
    const query = new URL(request.url).searchParams
    const hears = query.get('hears')
    const events = await access.join({
      record: { resource: 'meetings', key: query.get('call')! },
      member: String(session.user.id),
      publish: query.get('role') !== 'listener',
      ...(hears && { hears: (track) => track.member === hears && track.kind === 'video' }),
    })
    return acceptWebSocket({
      ...events,
      onOpen: (socket) => {
        sockets.add(socket)
        return events.onOpen?.(socket)
      },
    })
  })
  const functions = functionRoutes({
    basePath: '/api/functions',
    functions: { meeting },
    authenticate: (request) => {
      const member = new URL(request.url).searchParams.get('as')
      if (!member) throw new Error('No member')
      return { user: { id: member, roles: ['*'] } }
    },
    access: {},
    db,
    records: (session) => meetings(String(session.user.id)),
    onError: createErrorHandler((error) => void errors.push(error)),
    wake: () => {},
    channels: { broadcast: async () => {} },
    decryptField: () => async () => null,
    upgradeWebSocket,
    calls: service,
    report: (error) => void errors.push(error),
  })
  // node-server hands the app its upgrade through `env`, which the function routes need for a socket.
  const fetch = (request: Request, env: unknown) => {
    const { pathname } = new URL(request.url)
    if (pathname === '/') return new Response(page.html, { headers: { 'content-type': 'text/html' } })
    if (pathname === '/client.js') return new Response(page.script, { headers: { 'content-type': 'text/javascript' } })
    return functions.fetch(request, env)
  }
  const http = createAdaptorServer({ fetch, websocket: { server: apiWebSocketServer() } })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    errors,
    runtime,
    /** Members who can no longer read any meeting, from the next check of their socket on. */
    denied,
    /** Closes every member's socket as a server going away does, which leaves their media sessions to be resumed. */
    dropSockets: () => {
      for (const socket of sockets) socket.close(1012, 'Service Restart')
      sockets.clear()
    },
    close: () => new Promise<void>((resolve) => http.close(() => resolve())),
  }
}
