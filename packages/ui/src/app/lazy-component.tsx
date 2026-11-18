import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

/**
 * A component whose code loads the first time it draws, as a chunk of its own, with what `fallback` gives for its props
 * in its place until then, such as a skeleton of its size; the start then loads only what draws the shell and its
 * loading states. `load` names the component in its module.
 */
export const lazyComponent = <P extends object>(load: () => Promise<ComponentType<P>>, fallback: (props: P) => ReactNode = () => null) => {
  const Loaded = lazy(() => load().then((component) => ({ default: component })))
  const Lazy = (props: P) => (
    <Suspense fallback={fallback(props)}>
      <Loaded {...props} />
    </Suspense>
  )
  return Lazy
}
