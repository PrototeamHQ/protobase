import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import type { Db } from '@protobase/query'
import { defineFunction, type CallsOptions, type FunctionRecords, type FunctionSocket } from '@protobase/server'
import { createErrorHandler } from '../../../packages/server/src/error-handler'
import { functionRoutes } from '../../../packages/server/src/functions/routes'

/**
 * The function an app would write to admit members to a call, served with the app's function routes: the member is
 * `?as=`, which stands in for the signed-in user; `?role=listener` may not publish; `?hears=<member>` hears only that
 * member's video. Every socket it accepts is kept, so a test can drop them as a deploy would.
 */
export const startCallServer = async (calls: CallsOptions, page: { html: string; script: string }) => {
  const sockets = new Set<FunctionSocket>()
  const errors: unknown[] = []
  const meeting = defineFunction(async (request, { session, acceptWebSocket, calls: access }) => {
    const query = new URL(request.url).searchParams
    const hears = query.get('hears')
    const events = await access.join({
      call: query.get('call')!,
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
    db: {} as Db,
    records: () => ({}) as FunctionRecords,
    onError: createErrorHandler((error) => void errors.push(error)),
    wake: () => {},
    decryptField: () => async () => null,
    upgradeWebSocket,
    calls,
    report: (error) => void errors.push(error),
  })
  // node-server hands the app its upgrade through `env`, which the function routes need for a socket.
  const fetch = (request: Request, env: unknown) => {
    const { pathname } = new URL(request.url)
    if (pathname === '/') return new Response(page.html, { headers: { 'content-type': 'text/html' } })
    if (pathname === '/client.js') return new Response(page.script, { headers: { 'content-type': 'text/javascript' } })
    return functions.fetch(request, env)
  }
  const http = createAdaptorServer({ fetch, websocket: { server: new WebSocketServer({ noServer: true }) } })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    errors,
    /** Closes every member's socket as a server going away does, which leaves their media sessions to be resumed. */
    dropSockets: () => {
      for (const socket of sockets) socket.close(1012, 'Service Restart')
      sockets.clear()
    },
    close: () => new Promise<void>((resolve) => http.close(() => resolve())),
  }
}
