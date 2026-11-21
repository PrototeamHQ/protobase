import { Component, lazy, Suspense, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react'
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
 * copies were waiting on it, and the next copy mounted imports again; an error the loaded part throws is reported too.
 */
export const lazyPart = <P extends object>(load: () => Promise<ComponentType<P>>, Fallback: ComponentType<P>, report: Report = reportRenderError) => {
  // React.lazy keeps a rejected import for good, so a failed one is replaced by a fresh one for the copies mounted next
  let failedImport: unknown
  const fresh = () =>
    lazy(() =>
      load().then(
        (component) => ({ default: component }),
        (error: unknown) => {
          failedImport = error
          current = fresh()
          report(error)
          throw error
        },
      ),
    )
  let current = fresh()
  const onError: Report = (error, componentStack) => {
    if (error !== failedImport) report(error, componentStack)
  }

  return (props: P) => {
    // Each copy keeps the import it mounted with, so one that failed draws its fallback rather than importing again
    const [Part] = useState(() => current)
    return (
      <PartBoundary fallback={<Fallback {...props} />} onError={onError}>
        <Suspense fallback={<Fallback {...props} />}>
          <Part {...props} />
        </Suspense>
      </PartBoundary>
    )
  }
}
