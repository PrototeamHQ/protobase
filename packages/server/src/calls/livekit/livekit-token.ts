import { SignJWT } from 'jose'
import type { LiveKitBackend } from '../calls-options'

/** What one member may do in one call's LiveKit room. */
export type LiveKitGrant = { room: string; identity: string; canPublish: boolean; canPublishSources?: string[] }

/** How long a member's token admits a join; a resume mints a new one. */
const tokenSeconds = 10 * 60

/**
 * A LiveKit access token for one member of one room, signed with the backend's key: no name, metadata or data
 * messages, since names, roles and chat stay in Protobase.
 */
export const liveKitToken = async ({ apiKey, apiSecret }: LiveKitBackend, grant: LiveKitGrant) => {
  const now = Math.floor(Date.now() / 1000)
  const video = {
    room: grant.room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: grant.canPublish,
    canPublishData: false,
    canUpdateOwnMetadata: false,
    ...(grant.canPublishSources && { canPublishSources: grant.canPublishSources }),
  }
  return new SignJWT({ video })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(apiKey)
    .setSubject(grant.identity)
    .setNotBefore(now)
    .setExpirationTime(now + tokenSeconds)
    .setJti(grant.identity)
    .sign(new TextEncoder().encode(apiSecret))
}
