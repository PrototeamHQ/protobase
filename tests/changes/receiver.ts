import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export type Received = { path: string; headers: Record<string, string>; body: string }

/**
 * A local webhook receiver: it keeps every request and answers `200`, or the statuses queued for its path with
 * `failNext`, in order.
 */
export const startReceiver = async () => {
  const received: Received[] = []
  const answers = new Map<string, number[]>()
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      received.push({ path: request.url ?? '/', headers: request.headers as Record<string, string>, body })
      response.statusCode = answers.get(request.url ?? '/')?.shift() ?? 200
      response.end(response.statusCode === 200 ? 'ok' : 'down for maintenance')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    received,
    at: (path: string) => received.filter((request) => request.path === path),
    failNext: (path: string, ...statuses: number[]) => void answers.set(path, [...(answers.get(path) ?? []), ...statuses]),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
