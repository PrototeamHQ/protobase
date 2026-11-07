/** A path into a step's input, as its keys. */
export type InputPath = string[]

const pathKey = (path: InputPath) => JSON.stringify(path)

/**
 * A view of `input` that records which of its values a step reads: a key read records that key's path, its value
 * when it is a primitive; an array, and an object whose keys are listed (as `JSON.stringify`, `Object.keys`, a spread or
 * `for…in` list them), records its whole path. `paths()` gives the paths read, each one no other path read contains.
 */
export const trackReads = <T extends object>(input: T) => {
  const read = new Map<string, InputPath>()
  const record = (path: InputPath) => void read.set(pathKey(path), path)
  const views = new Map<string, object>()
  const view = (target: object, path: InputPath): object => {
    const known = views.get(pathKey(path))
    if (known) return known
    const proxy = new Proxy(target, {
      get(object, key, receiver) {
        if (typeof key === 'symbol') return Reflect.get(object, key, receiver)
        const at = [...path, key]
        if (!Object.hasOwn(object, key)) {
          record(at)
          return Reflect.get(object, key, receiver)
        }
        const value = (object as Record<string, unknown>)[key]
        if (Array.isArray(value) || typeof value !== 'object' || value === null) {
          record(at)
          return value
        }
        return view(value, at)
      },
      has(object, key) {
        if (typeof key === 'string') record([...path, key])
        return Reflect.has(object, key)
      },
      ownKeys(object) {
        record(path)
        return Reflect.ownKeys(object)
      },
      getOwnPropertyDescriptor(object, key) {
        record(path)
        return Reflect.getOwnPropertyDescriptor(object, key)
      },
    })
    views.set(pathKey(path), proxy)
    return proxy
  }
  const paths = (): InputPath[] => {
    const all = [...read.values()].sort((a, b) => a.length - b.length)
    const kept: InputPath[] = []
    for (const path of all) if (!kept.some((outer) => outer.every((key, i) => path[i] === key))) kept.push(path)
    return kept.sort((a, b) => (pathKey(a) < pathKey(b) ? -1 : 1))
  }
  return { input: view(input, []) as T, paths }
}
