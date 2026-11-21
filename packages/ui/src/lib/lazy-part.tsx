import { Component, lazy, Suspense, useEffect, useSyncExternalStore, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
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
 * import fails, such as offline or after an update removed the old chunk. A failed import is reported once, however many
 * copies were waiting on it; the next copy mounted imports again, and when that import loads every copy on screen draws
 * the part. An error the loaded part throws is reported too.
 */
export const lazyPart = <P extends object>(load: () => Promise<ComponentType<P>>, Fallback: ComponentType<P>, report: Report = reportRenderError) => {
  let failed = false
  let importError: unknown
  // React.lazy keeps a rejected import for good, so each attempt is a lazy component of its own
  const attempt = (number: number) => ({
    number,
    Part: lazy(() =>
      load().then(
        (component) => ({ default: component }),
        (error: unknown) => {
          failed = true
          importError = error
          report(error)
          throw error
        },
      ),
    ),
  })
  let current = attempt(0)

  // The copies on screen, which all move to a new attempt together
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const retry = () => {
    if (!failed) return
    failed = false
    current = attempt(current.number + 1)
    for (const listener of listeners) listener()
  }
  const onError: Report = (error, componentStack) => {
    if (error !== importError) report(error, componentStack)
  }

  return (props: P) => {
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
}
