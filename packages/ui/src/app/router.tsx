import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'

type RouterValue = {
  /** Path below the base path, always starting with `/`. */
  path: string
  params: URLSearchParams
  basePath: string
  navigate: (to: string, options?: { replace?: boolean }) => void
  /** Merges query parameters into the current URL; `undefined` removes one. */
  setParams: (patch: Record<string, string | undefined>) => void
  /** Asks to be told before the page changes; returns how to stop asking. Used by `useNavigationGuard`. */
  registerGuard: () => () => void
}

const RouterContext = createContext<RouterValue | null>(null)

export const useRouter = () => {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter must be used inside Router')
  return value
}

export type RouterProps = {
  basePath?: string
  /** Keeps the location in memory instead of the address bar, for Storybook and tests. */
  initialUrl?: string
  children: ReactNode
}

const browserUrl = () => `${window.location.pathname}${window.location.search}`

type Pending = { kind: 'link'; full: string; replace: boolean } | { kind: 'history'; delta: number }

const pathOf = (url: string) => new URL(url, 'http://local').pathname

/** Our place in the browser history, so a back or forward press can be told apart and, if needed, undone. */
const historyIndex = () => (window.history.state as { protobaseIndex?: number } | null)?.protobaseIndex ?? 0

export const Router = ({ basePath = '', initialUrl, children }: RouterProps) => {
  const memory = initialUrl !== undefined
  const [url, setUrl] = useState(initialUrl ?? browserUrl())
  const guards = useRef(new Set<symbol>())
  const urlRef = useRef(url)
  urlRef.current = url
  const position = useRef(memory ? 0 : historyIndex())
  const undoing = useRef(false)
  const proceeding = useRef(false)
  const [pending, setPending] = useState<Pending>()

  useEffect(() => {
    if (memory) return
    window.history.replaceState({ protobaseIndex: position.current }, '')
    const onPop = () => {
      const next = historyIndex()
      if (undoing.current) {
        undoing.current = false
        position.current = next
        return
      }
      const delta = next - position.current
      const leaving = pathOf(browserUrl()) !== pathOf(urlRef.current)
      if (!proceeding.current && guards.current.size > 0 && leaving) {
        // The browser has already moved; step back to where the person was and ask.
        undoing.current = true
        window.history.go(-delta)
        setPending({ kind: 'history', delta })
        return
      }
      proceeding.current = false
      position.current = next
      setUrl(browserUrl())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [memory])

  const go = useCallback(
    (full: string, replace: boolean) => {
      if (!memory) {
        position.current += replace ? 0 : 1
        window.history[replace ? 'replaceState' : 'pushState']({ protobaseIndex: position.current }, '', full)
      }
      setUrl(full)
    },
    [memory],
  )

  const navigate = useCallback(
    (to: string, { replace = false }: { replace?: boolean } = {}) => {
      const full = to.startsWith(basePath) && basePath ? to : `${basePath}${to}`
      if (pathOf(full) !== pathOf(urlRef.current) && guards.current.size > 0) return setPending({ kind: 'link', full, replace })
      go(full, replace)
    },
    [basePath, go],
  )

  const registerGuard = useCallback(() => {
    const token = Symbol('guard')
    guards.current.add(token)
    return () => void guards.current.delete(token)
  }, [])

  const leave = () => {
    if (!pending) return
    setPending(undefined)
    if (pending.kind === 'link') return go(pending.full, pending.replace)
    proceeding.current = true
    window.history.go(pending.delta)
  }

  const value = useMemo<RouterValue>(() => {
    const parsed = new URL(url, 'http://local')
    const path = parsed.pathname.slice(basePath.length) || '/'
    return {
      path,
      params: parsed.searchParams,
      basePath,
      navigate,
      registerGuard,
      setParams: (patch) => {
        const next = new URLSearchParams(parsed.searchParams)
        for (const [name, entry] of Object.entries(patch)) {
          if (entry === undefined || entry === '') next.delete(name)
          else next.set(name, entry)
        }
        const query = next.toString()
        navigate(`${path}${query ? `?${query}` : ''}`, { replace: true })
      },
    }
  }, [url, basePath, navigate, registerGuard])

  return (
    <RouterContext.Provider value={value}>
      {children}
      {pending && (
        <Dialog
          title="Leave without saving?"
          description="You have unsaved changes on this page. They stay in this browser, and come back when you open the record again."
          onClose={() => setPending(undefined)}
          actions={
            <>
              <Button onClick={() => setPending(undefined)}>Stay</Button>
              <Button variant="primary" onClick={leave}>
                Leave
              </Button>
            </>
          }
        />
      )}
    </RouterContext.Provider>
  )
}

export const Link = ({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => {
  const { navigate, basePath } = useRouter()
  return (
    <a
      href={`${basePath}${to}`}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.button !== 0) return
        event.preventDefault()
        navigate(to)
      }}
      {...rest}
    />
  )
}

export type Route = { resource?: string; key?: string }

/** `/orders` is a list, `/orders/<key>` a record; composite keys stay in their comma-joined form. */
export const matchRoute = (path: string): Route => {
  const [resource, key] = path.split('/').filter(Boolean)
  return { resource: resource && decodeURIComponent(resource), key: key && decodeURIComponent(key) }
}

/** While `active`, leaving the page asks first (in-app links and closing the tab). */
export const useNavigationGuard = (active: boolean) => {
  const { registerGuard } = useRouter()
  useEffect(() => (active ? registerGuard() : undefined), [active, registerGuard])
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
}
