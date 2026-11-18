import { Suspense, use, type ComponentType, type ReactNode } from 'react'

/**
 * A component whose code loads the first time it draws, or earlier with `preload`, as a chunk of its own, with what
 * `fallback` gives for its props in its place until then, such as a skeleton of its size, marked busy; the start then loads only
 * what draws the shell and its loading states. Once loaded it draws at once, with no fallback in between. `load` names
 * the component in its module; a load that fails is tried again the next time.
 */
export const lazyComponent = <P extends object>(load: () => Promise<ComponentType<P>>, fallback: (props: P) => ReactNode = () => null) => {
  let loaded: ComponentType<P> | undefined
  let loading: Promise<ComponentType<P>> | undefined
  const preload = () =>
    (loading ??= load().then(
      (component) => (loaded = component),
      (error: unknown) => {
        loading = undefined
        throw error
      },
    ))
  const Loaded = (props: P) => {
    const Component = loaded ?? use(preload())
    return <Component {...props} />
  }
  // The fallback says it is loading, in a box of no layout of its own
  const Lazy = (props: P) => (
    <Suspense
      fallback={
        <span aria-busy className="contents">
          {fallback(props)}
        </span>
      }
    >
      <Loaded {...props} />
    </Suspense>
  )
  return Object.assign(Lazy, { preload })
}
