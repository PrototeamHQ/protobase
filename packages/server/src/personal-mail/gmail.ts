import type { PersonalMailProvider } from './personal-mail-provider'
import { PersonalMailError } from './personal-mail-error'
import { rfc822Message } from './rfc822-message'
import { gmailCause, gmailError, gmailReason } from './gmail-errors'
import { gmailSettingsScope, listGmailSenderAddresses } from './gmail-sender-addresses'

export { gmailSettingsScope }

/** The Gmail API's scope that sends mail and nothing else: no reading of the mailbox. */
export const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send'

/** Its upload endpoint takes the message as it is, up to 35 MB, where the JSON one takes it base64-encoded. */
export const gmailSendUrl = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media'

/**
 * Gmail, linked through Google sign-in: offline access, so Google gives a refresh token, asked with `prompt=consent`
 * so it gives one again on a second link. Without `from`, Gmail sets the From header to the linked address; with it,
 * Gmail keeps it when it is one of the account's verified send-as addresses, and puts the account's own address in its
 * place when it is not, still sending the message: so a link with `gmailSettingsScope` lists the send-as addresses,
 * which tells the ones Gmail sends as from the others.
 *
 * A send resolves to no `messageId`: Gmail puts its own `Message-ID` on the mail it sends, and its answer, the sent
 * message's Gmail id, does not name it; reading it back takes a scope that reads the mailbox, which the link does not ask for.
 */
export const gmail = (fetcher: typeof fetch = (...args) => fetch(...args)): PersonalMailProvider => ({
  id: 'gmail',
  name: 'Gmail',
  signInProvider: 'google',
  scopes: [gmailSendScope],
  optionalScopes: [gmailSettingsScope],
  addedScopes: [],
  linkParams: { access_type: 'offline', prompt: 'consent' },
  send: async (message, accessToken, from) => {
    const body = await rfc822Message(message, from)
    const response = await fetcher(gmailSendUrl, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'message/rfc822' }, body: new Uint8Array(body) })
    if (response.ok) return {}
    // 401: the token is no longer good; 403 with insufficient scope: the grant to send was taken back.
    if (response.status === 401) throw new PersonalMailError('link_expired', 'gmail')
    const error = await gmailError(response)
    if (response.status === 403 && gmailReason(error) === 'insufficientPermissions') throw new PersonalMailError('link_expired', 'gmail')
    throw new Error(`Gmail refused the message: ${response.status} ${response.statusText}${gmailCause(error)}`)
  },
  list_sender_addresses: (connection) => listGmailSenderAddresses(fetcher, connection),
})
