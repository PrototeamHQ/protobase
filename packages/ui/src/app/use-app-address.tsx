import { useCallback, useMemo, type AnchorHTMLAttributes } from 'react'
import { appPath, readAppPath, type AppAddress } from '@protobase/schema'
import { useIsXs } from '../lib/use-media-query'
import { changedList, currentAddress, listDefaults, type ListChange } from './current-address'
import { useAdminMeta } from './meta-gate'
import { Link, useRouter } from './router'

export type { CurrentAddress, ListAddress, ListChange } from './current-address'

/**
 * The app's address as logical values, and the ways to change it: `set` changes the list in place, `go` moves to
 * another address, `href` is an address for an `<a href>` and `open` follows such an href. Every component reads and
 * writes the address through this hook, never the query string or a path of its own.
 */
export const useAppAddress = () => {
  const { path, params, basePath, navigate } = useRouter()
  const { pages, resources, views } = useAdminMeta()
  const xs = useIsXs()
  const pageNames = useMemo(() => new Set(Object.keys(pages)), [pages])
  const query = params.toString()
  const read = useMemo(() => readAppPath(query ? `${path}?${query}` : path, pageNames), [path, query, pageNames])
  const defaults = useCallback((resource: string) => listDefaults(resources[resource], views[resource], xs), [resources, views, xs])
  const address = useMemo(() => currentAddress(read, defaults), [read, defaults])

  const go = useCallback((to: AppAddress, options?: { replace?: boolean }) => navigate(appPath(to), options), [navigate])

  const set = useCallback(
    (change: ListChange) => {
      if (read?.kind !== 'list') throw new Error('set changes the list the app shows; use go to move to another address')
      go(changedList(read, change, defaults(read.resource)), { replace: true })
    },
    [read, defaults, go],
  )

  const href = useCallback((to: AppAddress) => appPath(to, basePath), [basePath])

  // The shell's links carry the base path, as hrefs must; the router takes the path below it.
  const open = useCallback((target: string) => navigate(target.startsWith(`${basePath}/`) ? target.slice(basePath.length) : target), [basePath, navigate])

  return { address, set, go, href, open }
}

/** A link to an address in the app: an ordinary anchor that the router follows without reloading the page. */
export const AppLink = ({ to, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: AppAddress }) => <Link to={appPath(to)} {...rest} />
