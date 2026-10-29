import { mobileReleasePath, mobileReleaseQuery, type MobileReleaseAnswer } from '@protobase/schema/internal'
import { releaseAnswerOf } from './release-answer'

/** How long the app waits for the server's answer before it goes on with the files it runs. */
export const releaseCheckTimeoutMs = 15_000

export type ReleaseCheckInput = { apiOrigin: string; fingerprint: string; shellVersion: string }

// What fetch throws when it gets no answer: no network (TypeError), or the timeout (TimeoutError).
const noAnswer = (error: unknown) => error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')

/**
 * Asks the app's server which release this binary should run. `undefined` for anything but a 200 holding the answer:
 * a 503 while the server starts, a 500, no network, the timeout or another body, after which the app keeps the files
 * it runs. The route is public, so no credentials go with it.
 */
export const checkRelease = async (fetch: typeof globalThis.fetch, { apiOrigin, fingerprint, shellVersion }: ReleaseCheckInput): Promise<MobileReleaseAnswer | undefined> => {
  const url = `${apiOrigin}${mobileReleasePath}?${mobileReleaseQuery({ fingerprint, shellVersion })}`
  try {
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(releaseCheckTimeoutMs) })
    if (response.status !== 200) return
    return releaseAnswerOf(await response.json())
  } catch (error) {
    if (noAnswer(error) || error instanceof SyntaxError) return
    throw error
  }
}
