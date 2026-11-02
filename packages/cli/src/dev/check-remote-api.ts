/**
 * Fails, before the dev server starts, when the instance at `origin` cannot be reached or does not answer `/api/meta`
 * as a Protobase API does, with the X-Meta-Version header.
 */
export const checkRemoteApi = async (origin: string) => {
  const meta = `${origin}/api/meta`
  const answer = await fetch(meta, { signal: AbortSignal.timeout(10_000), redirect: 'manual' }).catch((error: Error) => {
    throw new Error(`Cannot reach the API at ${meta}: ${(error.cause as Error | undefined)?.message ?? error.message}`)
  })
  await answer.body?.cancel()
  if (!answer.headers.has('x-meta-version')) throw new Error(`${origin} answered ${meta} with ${answer.status} and no X-Meta-Version header; is it a Protobase app?`)
}
