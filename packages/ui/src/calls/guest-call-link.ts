import { useMemo } from 'react'
import { useRouter } from '../app/router'

/** The path a guest link opens, below the app's base path: its token follows in the fragment, which no server sees. */
export const guestCallLinkPath = '/-/call-guest'

/** The guest link of a token, at the app's base, such as `https://chat.example.com`. */
export const guestCallLink = (base: string, token: string) => `${base}${guestCallLinkPath}#${token}`

/** The guest link of this path and fragment: its token, or `undefined` for any other page. */
export const readGuestCallLink = (path: string, hash: string): { token: string } | undefined => {
  const token = hash.replace(/^#/, '')
  return path === guestCallLinkPath && token ? { token } : undefined
}

/** The guest link the address shows, `/-/call-guest#<token>`, as logical values; `undefined` on any other page. */
export const useGuestCallAddress = () => {
  const { path } = useRouter()
  return useMemo(() => readGuestCallLink(path, globalThis.location?.hash ?? ''), [path])
}
