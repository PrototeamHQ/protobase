import { sign, type KeyObject } from 'node:crypto'
import { releaseStatementContext, type ReleaseBinding } from '@protobase/schema/internal'

/**
 * The statement file of a release bound to `binding`, signed with `signingKey` (see `releaseStatementFile`). The
 * device verifies the signature over the payload's decoded bytes as they are, then parses those same bytes.
 */
export const releaseStatement = (binding: ReleaseBinding, signingKey: KeyObject) => {
  const { manifest, order, appId, fingerprint, shellVersion } = binding
  const payload = Buffer.from(JSON.stringify({ manifest, order, appId, fingerprint, shellVersion }))
  const signature = sign('sha256', Buffer.concat([Buffer.from(releaseStatementContext), payload]), signingKey)
  return new TextEncoder().encode(JSON.stringify({ payload: payload.toString('hex'), signature: signature.toString('hex') }))
}
