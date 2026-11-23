import { Component, Suspense, use, useEffect, useState, useSyncExternalStore, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
import { reportRenderError } from '../app/error-reporting'

type Report = (error: unknown, componentStack?: string | null) => void

// Draws the fallback in place of a part that threw, so a part that did not load or draw cannot take the page with it
class PartBoundary extends Component<{ fallback: ReactNode; onError: Report; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError(error, info.componentStack)
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * A component whose code `load` imports on first use, drawn as `Fallback` with the same props while it loads and when the
 * import fails, such as offline or after an update removed the old chunk. Once loaded, a copy mounted later draws the part
 * straight away. A failed import is reported once, however many copies were waiting on it; the next copy mounted imports
 * again, and when that import loads every copy on screen draws the part. An error the loaded part throws is reported too.
 * Its `useLoaded()` imports the part too and tells, from then on, once the import has loaded or failed, so a page can
 * wait for it before it shows what the part draws.
 */
export const lazyPart = <P extends object>(load: () => Promise<ComponentType<P>>, Fallback: ComponentType<P>, report: Report = reportRenderError) => {
  let loaded: ComponentType<P> | undefined
  let failed = false
  let importError: unknown

  // The copies on screen and the pages waiting, which all move on together when an import ends or a new attempt starts
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const notify = () => {
    for (const listener of listeners) listener()
  }

  // Each attempt imports once, and its part waits on that import, which gives no part when it fails; a failed import
  // stays failed for that attempt, and its part throws the import's error for the boundary to draw the fallback
  const attempt = (number: number) => {
    let started: Promise<ComponentType<P> | undefined> | undefined
    const start = () =>
      (started ??= load().then(
        (component) => {
          loaded = component
          notify()
          return component
        },
        (error: unknown): undefined => {
          failed = true
          importError = error
          report(error)
          notify()
        },
      ))
    const Part = (props: P) => {
      const Loaded = loaded ?? use(start())
      if (!Loaded) throw importError
      return <Loaded {...props} />
    }
    return { number, start, Part }
  }
  let current = attempt(0)

  const retry = () => {
    if (!failed) return
    failed = false
    current = attempt(current.number + 1)
    notify()
  }
  const onError: Report = (error, componentStack) => {
    if (error !== importError) report(error, componentStack)
  }

  const LazyPart = (props: P) => {
    useEffect(retry, [])
    const { number, Part } = useSyncExternalStore(subscribe, () => current)
    return (
      <PartBoundary key={number} fallback={<Fallback {...props} />} onError={onError}>
        <Suspense fallback={<Fallback {...props} />}>
          <Part {...props} />
        </Suspense>
      </PartBoundary>
    )
  }
  const useLoaded = () => {
    useEffect(() => {
      retry()
      void current.start()
    }, [])
    // Kept once ended: the copies the page then shows import again after a failure, drawn as the fallback meanwhile
    const ended = useSyncExternalStore(subscribe, () => loaded !== undefined || failed)
    const [was, setWas] = useState(false)
    if (ended && !was) setWas(true)
    return was || ended
  }
  return Object.assign(LazyPart, { useLoaded })
}
