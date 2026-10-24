import { generateVapidKeys, vapidPrivateKeyVariable, vapidPublicKeyVariable, vapidSubjectVariable } from '@protobase/server'

/**
 * Prints a fresh VAPID key pair as the two environment variables Web Push reads, and on `note` how to set the third.
 * It reads no project, writes no file and makes no request.
 */
export const printVapidKeys = (out: (text: string) => void, note: (text: string) => void) => {
  const { publicKey, privateKey } = generateVapidKeys()
  out(`${vapidPublicKeyVariable}=${publicKey}\n${vapidPrivateKeyVariable}=${privateKey}\n`)
  note(`Set ${vapidSubjectVariable} too, to a mailto: address or https: URL push services can reach you at. Keep the private key secret.\n`)
}
