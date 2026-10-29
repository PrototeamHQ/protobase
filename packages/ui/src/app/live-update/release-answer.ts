import type { MobileReleaseAnswer } from '@protobase/schema/internal'

// The ids the Android guard takes: one safe path component.
const bundleIdPattern = /^[A-Za-z0-9_-]{1,64}$/

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The server's answer to `GET /api/mobile/release` when it is one: `bundleId` a safe id or null, `url` a string or null
 * and `required` a boolean. Any other body is `undefined`, which changes nothing; fields a later server adds are
 * ignored.
 */
export const releaseAnswerOf = (body: unknown): MobileReleaseAnswer | undefined => {
  if (!isRecord(body)) return
  const { bundleId, url, required } = body
  if (bundleId !== null && (typeof bundleId !== 'string' || !bundleIdPattern.test(bundleId))) return
  if (url !== null && typeof url !== 'string') return
  if (typeof required !== 'boolean') return
  return { bundleId, url, required }
}
