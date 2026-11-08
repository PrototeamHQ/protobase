import { generateKeyPairSync } from 'node:crypto'
import { readFcmSettings } from '../fcm-settings'
import { clientEmailPlaceholder, projectPlaceholder } from './recordings'

/** A service account key made up for tests, with the recordings' project and address, as JSON and as settings. */
export const testServiceAccount = (modulusLength = 2048) => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength })
  const json = { type: 'service_account', project_id: projectPlaceholder, private_key_id: 'key-1', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), client_email: clientEmailPlaceholder, token_uri: 'https://oauth2.googleapis.com/token' }
  return { json, publicKey, settings: () => readFcmSettings({ PROTOBASE_FCM_SERVICE_ACCOUNT: JSON.stringify(json) })! }
}
