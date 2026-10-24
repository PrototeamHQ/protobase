import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { guarded } from '../lib/guarded'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { RouteLink } from '../primitives/route-link'
import { text as appText } from './messages'
import { createPagePlaces } from './page-places'
import { restoreScroll } from './restore-scroll'

type RouterValue = {
  /** Path below the base path, always starting with `/`. */
  path: string
  params: URLSearchParams
  basePath: string
  /** The id of this page's entry in the tab's history: Back and Forward return to the same id, a reload keeps it. */
  entry: string
  /** Moves to a path below the base path, as `appPath` writes it. */
  navigate: (to: string, options?: { replace?: boolean }) => void
  /** Goes back to a path below the base path: as the browser's Back when the page before is that path, else as `navigate`. */
  back: (to: string) => void
  /** Asks to be told before the page changes; returns how to stop asking. Used by `useNavigationGuard`. */
  registerGuard: (kind?: GuardKind) => () => void
  /** Reloads the page, asking first while a guard holds unsaved changes. */
  reload: () => void
  /** Whether the person chose to reload despite unsaved changes, so the page leaves without asking again. */
  reloadConfirmed: () => boolean
}

/**
 * What leaving the page does to the input a guard holds: `draft-kept` when this browser keeps it, as a record's draft,
 * `input-lost` when it is gone.
 */
export type GuardKind = 'draft-kept' | 'input-lost'

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

/** A change of page waiting for the person's answer; `inputLost` when a guard's input would be gone, not kept. */
type Pending = ({ kind: 'link'; full: string; replace: boolean } | { kind: 'history'; delta: number } | { kind: 'reload' }) & { inputLost: boolean }

const pathOf = (url: string) => new URL(url, 'http://local').pathname

/** `protobasePrevious` is the URL of the page this entry was opened from, so going back to it can take the browser's Back. */
type HistoryState = { protobaseIndex?: number; protobaseEntry?: string; protobasePrevious?: string }
const historyState = () => (window.history.state as HistoryState | null) ?? {}

/** Our place in the browser history, so a back or forward press can be told apart and, if needed, undone. */
const historyIndex = () => historyState().protobaseIndex ?? 0

const newEntry = () => Math.random().toString(36).slice(2)

/** The id of the current history entry, given one if it has none yet, as an entry pushed before the app started. */
const historyEntry = () => {
  const state = historyState()
  if (state.protobaseEntry) return state.protobaseEntry
  const entry = newEntry()
  window.history.replaceState({ ...state, protobaseEntry: entry }, '')
  return entry
}

const noStorage = { getItem: () => null, setItem: () => {} }

export const Router = ({ basePath = '', initialUrl, children }: RouterProps) => {
  const memory = initialUrl !== undefined
  const [page, setPage] = useState(() => ({ url: initialUrl ?? browserUrl(), entry: memory ? newEntry() : historyEntry() }))
  const [places] = useState(() => createPagePlaces(memory ? noStorage : (guarded(() => window.sessionStorage, undefined) ?? noStorage)))
  const guards = useRef(new Map<symbol, GuardKind>())
  const losesInput = () => [...guards.current.values()].includes('input-lost')
  const current = useRef(page)
  current.current = page
  const position = useRef(memory ? 0 : historyIndex())
  const undoing = useRef(false)
  const proceeding = useRef(false)
  // A Leave pressed before the step back has landed: the browser drops a traversal asked for while another is under way.
  const leaveAfterUndo = useRef<number | undefined>(undefined)
  const reloading = useRef(false)
  const [pending, setPending] = useState<Pending>()
  // Where the page being left was scrolled, read before the next page is drawn and changes it
  const rememberScroll = useCallback(() => places.save(current.current.entry, window.scrollY), [places])

  // A new page starts at the top, and one gone back or forward to where it was left. The browser's own restoring cannot:
  // a pushed entry keeps the scroll position, and a traversal restores it before the page it returns to is drawn.
  useLayoutEffect(() => restoreScroll(places.placeOf(page.entry)), [places, page.entry])

  useEffect(() => {
    if (memory) return
    window.history.scrollRestoration = 'manual'
    window.history.replaceState({ ...historyState(), protobaseIndex: position.current, protobaseEntry: current.current.entry }, '')
    // A reload or a discarded tab comes back to where the page was
    const persist = () => {
      rememberScroll()
      places.persist()
    }
    const hidden = () => document.visibilityState === 'hidden' && persist()
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', hidden)
    const onPop = () => {
      const next = historyIndex()
      if (undoing.current) {
        undoing.current = false
        position.current = next
        if (leaveAfterUndo.current !== undefined) window.history.go(leaveAfterUndo.current)
        leaveAfterUndo.current = undefined
        return
      }
      const delta = next - position.current
      const leaving = pathOf(browserUrl()) !== pathOf(current.current.url)
      if (!proceeding.current && guards.current.size > 0 && leaving) {
        // The browser has already moved; step back to where the person was and ask.
        undoing.current = true
        window.history.go(-delta)
        setPending({ kind: 'history', delta, inputLost: losesInput() })
        return
      }
      proceeding.current = false
      position.current = next
      rememberScroll()
      setPage({ url: browserUrl(), entry: historyEntry() })
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [memory, rememberScroll, places])

  const go = useCallback(
    (full: string, replace: boolean) => {
      const entry = replace ? current.current.entry : newEntry()
      if (!memory) {
        position.current += replace ? 0 : 1
        const previous = replace ? historyState().protobasePrevious : current.current.url
        window.history[replace ? 'replaceState' : 'pushState']({ protobaseIndex: position.current, protobaseEntry: entry, protobasePrevious: previous }, '', full)
      }
      rememberScroll()
      setPage({ url: full, entry })
    },
    [memory, rememberScroll],
  )

  const navigate = useCallback(
    (to: string, { replace = false }: { replace?: boolean } = {}) => {
      const full = `${basePath}${to}`
      if (pathOf(full) !== pathOf(current.current.url) && guards.current.size > 0) return setPending({ kind: 'link', full, replace, inputLost: losesInput() })
      go(full, replace)
    },
    [basePath, go],
  )

  const back = useCallback(
    (to: string) => {
      const previous = memory ? undefined : historyState().protobasePrevious
      if (previous !== undefined && pathOf(previous) === pathOf(`${basePath}${to}`)) return window.history.back()
      navigate(to)
    },
    [memory, basePath, navigate],
  )

  const registerGuard = useCallback((kind: GuardKind = 'draft-kept') => {
    const token = Symbol('guard')
    guards.current.set(token, kind)
    return () => void guards.current.delete(token)
  }, [])

  const reload = useCallback(() => {
    if (guards.current.size > 0) return setPending({ kind: 'reload', inputLost: losesInput() })
    window.location.reload()
  }, [])

  const reloadConfirmed = useCallback(() => reloading.current, [])

  const leave = () => {
    if (!pending) return
    setPending(undefined)
    if (pending.kind === 'link') return go(pending.full, pending.replace)
    if (pending.kind === 'reload') {
      reloading.current = true
      return window.location.reload()
    }
    proceeding.current = true
    if (undoing.current) leaveAfterUndo.current = pending.delta
    else window.history.go(pending.delta)
  }

  const value = useMemo<RouterValue>(() => {
    const parsed = new URL(page.url, 'http://local')
    const path = parsed.pathname.slice(basePath.length) || '/'
    return {
      path,
      params: parsed.searchParams,
      basePath,
      entry: page.entry,
      navigate,
      back,
      registerGuard,
      reload,
      reloadConfirmed,
    }
  }, [page, basePath, navigate, back, registerGuard, reload, reloadConfirmed])

  return (
    <RouterContext.Provider value={value}>
      {children}
      {pending?.kind === 'reload' && (
        <Dialog
          title={appText('reloadTitle')}
          description={appText(pending.inputLost ? 'reloadInputLost' : 'reloadDraftKept')}
          onClose={() => setPending(undefined)}
          actions={
            <>
              <Button onClick={() => setPending(undefined)}>{appText('keepEditing')}</Button>
              <Button variant="primary" onClick={leave}>
                {appText('reload')}
              </Button>
            </>
          }
        />
      )}
      {pending && pending.kind !== 'reload' && (
        <Dialog
          title={appText('leaveTitle')}
          description={appText(pending.inputLost ? 'leaveInputLost' : 'leaveDescription')}
          onClose={() => setPending(undefined)}
          actions={
            <>
              <Button onClick={() => setPending(undefined)}>{appText('stay')}</Button>
              <Button variant="primary" onClick={leave}>
                {appText('leave')}
              </Button>
            </>
          }
        />
      )}
    </RouterContext.Provider>
  )
}

/** A link to a path below the base path, as `appPath` writes it, that the router follows without reloading the page. */
export const Link = ({ to, replace, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean }) => {
  const { navigate, basePath } = useRouter()
  return <RouteLink to={{ href: `${basePath}${to}`, onFollow: () => navigate(to, { replace }) }} {...rest} />
}

/** While `active`, leaving the page asks first (in-app links, a reload and closing the tab). */
export const useNavigationGuard = (active: boolean, kind: GuardKind = 'draft-kept') => {
  const { registerGuard, reloadConfirmed } = useRouter()
  useEffect(() => (active ? registerGuard(kind) : undefined), [active, kind, registerGuard])
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => {
      if (!reloadConfirmed()) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active, reloadConfirmed])
}
