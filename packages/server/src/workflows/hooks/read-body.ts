/**
 * The request's body, at most `limit` bytes, counted as they come off the stream whether or not the request declares
 * its length; `undefined` past the limit, having kept no more than `limit` bytes and cancelled the rest.
 */
export const readBody = async (request: Request, limit: number) => {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > limit) return undefined
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      return undefined
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}
