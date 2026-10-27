import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { alice, bob, bucket, fileName } from './users'

/**
 * A stand-in for the Supabase project's Storage API, which `protobase import supabase --storage-url` copies the bytes
 * from: each user's file at `/storage/v1/object/authenticated/<bucket>/<name>`, to the secret key `key` only.
 */
export const startStorageApi = async (key: string) => {
  const files = new Map([alice, bob].map((user) => [`/storage/v1/object/authenticated/${bucket}/${fileName(user)}`, user.file]))
  const server = createServer((request, response) => {
    const file = files.get(decodeURIComponent(new URL(request.url!, 'http://localhost').pathname))
    if (request.headers.apikey !== key) return response.writeHead(401).end()
    if (file === undefined) return response.writeHead(404).end()
    response.writeHead(200, { 'content-type': 'text/plain' }).end(file)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()))
  return { url, close }
}
