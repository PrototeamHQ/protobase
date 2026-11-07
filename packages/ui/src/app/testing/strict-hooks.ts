// React's hooks for one component, run as StrictMode runs them in development, which is how `protobase dev` serves the
// app: the component renders and mounts its effects, unmounts them and mounts them again; a state change renders it
// again and runs the effects whose dependencies changed. A test hands `strictReact` to `vi.mock('react')`.

type Effect = { deps: unknown[]; run: () => void | (() => void); cleanup?: void | (() => void) }

const values = new Map<number, { deps?: unknown[]; value: unknown }>()
const effects = new Map<number, Effect>()
let slot = 0
let due: [number, Effect][] = []
let component = () => {}

const changed = (before: unknown[] | undefined, after: unknown[]) => !before || after.some((value, i) => !Object.is(value, before[i]))
const run = (effect: Effect) => (effect.cleanup = effect.run())

const render = () => {
  slot = 0
  due = []
  component()
  for (const [at, effect] of due) {
    effects.get(at)?.cleanup?.()
    effects.set(at, effect)
    run(effect)
  }
}

export const strictReact = {
  useState: (initial?: unknown) => {
    const at = slot++
    if (!values.has(at)) values.set(at, { value: typeof initial === 'function' ? initial() : initial })
    const set = (value: unknown) => {
      if (Object.is(values.get(at)!.value, value)) return
      values.set(at, { value })
      queueMicrotask(render)
    }
    return [values.get(at)!.value, set]
  },
  useMemo: (make: () => unknown, deps: unknown[]) => {
    const at = slot++
    if (changed(values.get(at)?.deps, deps)) values.set(at, { deps, value: make() })
    return values.get(at)!.value
  },
  useEffect: (effect: Effect['run'], deps: unknown[]) => {
    const at = slot++
    if (changed(effects.get(at)?.deps, deps)) due.push([at, { deps, run: effect }])
  },
}

/** Mounts `hook`, unmounts it and mounts it again; the function it returns reads the hook's latest result. */
export const mountStrict = <T>(hook: () => T) => {
  let result: T | undefined
  component = () => {
    result = hook()
  }
  render()
  for (const effect of effects.values()) effect.cleanup?.()
  for (const effect of effects.values()) run(effect)
  return () => result
}
