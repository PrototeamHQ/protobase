/** Reads at most `limit` bytes of a response body, then cancels the rest, so a sender that never stops writing costs no more. */
export const readLimited = async (response: Response, limit: number) => {
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let read = 0
  while (read < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    read += value.length
  }
  await reader.cancel()
  return Buffer.concat(chunks).subarray(0, limit)
}
