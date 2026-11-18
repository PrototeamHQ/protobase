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

// Loopback hosts, which `protobase dev` serves on over plain http.
const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])

// RFC 8058 has mail clients post only to an https link, so another one would show no button: refused, but on loopback.
const linkBase = (appUrl: string) => {
  const url = new URL(appUrl)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback.has(url.hostname))) {
    throw new Error(`unsubscribe links must be https: set url in protobase.config.ts, or PROTOBASE_URL, to the app's https address, not ${url.origin}`)
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** Links to `<appUrl><path>/<token>`, each token signed with a key derived from the app's `secret`; `appUrl` is https, or http on loopback. */
export const unsubscribeLinks = ({ appUrl, path, secret }: { appUrl: string; path: string; secret: string }): UnsubscribeLinks => {
  const key = unsubscribeKey(secret)
  const base = `${linkBase(appUrl)}${path}`
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
