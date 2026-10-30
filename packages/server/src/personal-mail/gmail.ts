import type { PersonalMailProvider } from './personal-mail-provider'
import { PersonalMailError } from './personal-mail-error'
import { rfc822Message } from './rfc822-message'

/** The Gmail API's scope that sends mail and nothing else: no reading of the mailbox. */
export const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send'

/** Its upload endpoint takes the message as it is, up to 35 MB, where the JSON one takes it base64-encoded. */
export const gmailSendUrl = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media'

/**
 * Gmail, linked through Google sign-in: offline access, so Google gives a refresh token, asked with `prompt=consent`
 * so it gives one again on a second link. Gmail sets the From header to the linked address.
 */
export const gmail = (fetcher: typeof fetch = (...args) => fetch(...args)): PersonalMailProvider => ({
  id: 'gmail',
  name: 'Gmail',
  signInProvider: 'google',
  scopes: [gmailSendScope],
  linkParams: { access_type: 'offline', prompt: 'consent' },
  send: async (message, accessToken) => {
    const body = await rfc822Message(message)
    const response = await fetcher(gmailSendUrl, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'message/rfc822' }, body: new Uint8Array(body) })
    if (response.ok) return
    // 401: the token is no longer good; 403 with insufficient scope: the grant to send was taken back.
    if (response.status === 401) throw new PersonalMailError('link_expired', 'gmail')
    const error = await gmailError(response)
    if (response.status === 403 && gmailReason(error) === 'insufficientPermissions') throw new PersonalMailError('link_expired', 'gmail')
    throw new Error(`Gmail refused the message: ${response.status} ${response.statusText}${gmailCause(error)}`)
  },
})

type GmailError = { status?: string; message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] }

// Google's standard error body, read once; a body that is not JSON names nothing.
const gmailError = async (response: Response): Promise<GmailError | undefined> => {
  if (!response.headers.get('content-type')?.includes('json')) return
  const text = await response.text()
  try {
    return (JSON.parse(text) as { error?: GmailError }).error
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
}

// Google's error body names the reason in `errors[].reason`, or in `details[].reason` (`ACCESS_TOKEN_SCOPE_INSUFFICIENT`).
const gmailReason = (error: GmailError | undefined) => {
  const reasons = [...(error?.errors ?? []), ...(error?.details ?? [])].map((entry) => entry.reason)
  return reasons.includes('insufficientPermissions') || reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ? 'insufficientPermissions' : reasons[0]
}

// Only what Google says about the refusal, such as ` FAILED_PRECONDITION (failedPrecondition: Precondition check failed.)`.
const gmailCause = (error: GmailError | undefined) => {
  if (!error) return ''
  const reason = error.errors?.[0]?.reason
  const detail = [reason, error.message].filter(Boolean).join(': ')
  return `${error.status ? ` ${error.status}` : ''}${detail ? ` (${detail})` : ''}`
}
