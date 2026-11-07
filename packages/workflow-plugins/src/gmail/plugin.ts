import { definePlugin } from '@protobase/workflows/plugin'
import { newMailTrigger } from './new-mail'

/** Where Gmail's API answers. */
export const gmailApiUrl = 'https://gmail.googleapis.com'

const localHosts = ['localhost', '127.0.0.1', '[::1]']

// The API's origin, which the access token is sent to: https, or http on this machine for a test's own Gmail.
const apiOrigin = (value: string) => {
  const url = URL.canParse(value) ? new URL(value) : undefined
  if (!url || !(url.protocol === 'https:' || (url.protocol === 'http:' && localHosts.includes(url.hostname)))) throw new Error(`The Gmail plugin's apiUrl must be an https URL: ${value}`)
  return url.origin
}

/**
 * `gmail:*`: new mail of a mailbox its owner connected through the app's Google sign-in, with read-only access. Only
 * the app's code passes `apiUrl`, such as a test's own Gmail; a workflow never sets where the token goes.
 */
export const gmailPlugin = ({ apiUrl = gmailApiUrl }: { apiUrl?: string } = {}) =>
  definePlugin({
    name: 'gmail',
    label: 'Gmail',
    connections: {
      google: {
        label: 'Google account',
        signIn: 'google',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
        // Asks for a refresh token, which Google gives only with offline access and a consent it shows again.
        link_params: { access_type: 'offline', prompt: 'consent' },
        revocation_url: 'https://oauth2.googleapis.com/revoke',
      },
    },
    triggers: { new_mail: newMailTrigger(apiOrigin(apiUrl)) },
  })
