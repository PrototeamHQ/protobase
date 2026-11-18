import { readUnsubscribeToken, signUnsubscribeToken, unsubscribeKey, type UnsubscribeTarget } from './unsubscribe-token'

/** The unsubscribe links of an app's bulk mail: made by the jobs' mail, read by the unsubscribe endpoint. */
export type UnsubscribeLinks = {
  /** The link for `target`, on the app's URL. */
  url(target: UnsubscribeTarget): string
  /** What a link's token names, or `undefined` for one the app did not sign. */
  read(token: string): UnsubscribeTarget | undefined
}

/** The path of the unsubscribe endpoint under the API's system path, such as `/api/unsubscribe`. */
export const unsubscribePath = (systemPath: string) => `${systemPath}/unsubscribe`

/** Links to `<appUrl><path>/<token>`, each token signed with a key derived from the app's `secret`. */
export const unsubscribeLinks = ({ appUrl, path, secret }: { appUrl: string; path: string; secret: string }): UnsubscribeLinks => {
  const key = unsubscribeKey(secret)
  const base = `${new URL(appUrl).origin}${path}`
  return {
    url: (target) => `${base}/${signUnsubscribeToken(key, target)}`,
    read: (token) => readUnsubscribeToken(key, token),
  }
}

/** The secret the links are signed with: the app's `secret`, else `PROTOBASE_SECRET`; unsubscribe without either stops startup. */
export const unsubscribeSecret = (secret: string | undefined, env: Record<string, string | undefined> = globalThis.process?.env ?? {}) => {
  const found = secret ?? env.PROTOBASE_SECRET
  if (!found) throw new Error('unsubscribe signs its links with the app\'s secret: set secret in protobase.config.ts, or PROTOBASE_SECRET')
  return found
}
