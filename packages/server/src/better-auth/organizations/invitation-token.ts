// The token of an emailed invitation link: the invitation's id with a signature over the id and its expiry, keyed by the
// auth secret. Members read invitation ids (Better Auth's `list-invitations`), so the id alone must not accept an
// invitation; with the signature it can only come from the email. Resending moves the expiry, which voids the old link;
// revoking cancels the invitation, which the endpoints check. Web Crypto only, like the rest of the server.

const encoder = new TextEncoder()

const base64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const signature = async (secret: string, id: string, expiresAt: Date) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(`invitation:${id}:${new Date(expiresAt).getTime()}`)))
}

export const invitationToken = async (secret: string, invitation: { id: string; expiresAt: Date }) => `${invitation.id}.${await signature(secret, invitation.id, invitation.expiresAt)}`

/** The invitation id a token names; the signature is checked against the stored expiry with `verifyInvitationToken`. */
export const invitationIdOf = (token: string) => {
  const dot = token.lastIndexOf('.')
  return dot > 0 ? token.slice(0, dot) : undefined
}

export const verifyInvitationToken = async (secret: string, token: string, invitation: { id: string; expiresAt: Date }) => {
  const expected = await invitationToken(secret, invitation)
  if (expected.length !== token.length) return false
  // Compared in full, so the time taken says nothing about how much of a forged token was right.
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ token.charCodeAt(index)
  return difference === 0
}

/** The link in the email: the app's invitation page with the token. */
export const invitationLink = (pageUrl: string, token: string) => `${pageUrl}?token=${encodeURIComponent(token)}`
