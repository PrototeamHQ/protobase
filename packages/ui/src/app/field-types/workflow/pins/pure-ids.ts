// React Flow finds nodes and handles by CSS selectors it builds from their ids unescaped, so ids hold no quotes:
// each name in them is URI-encoded, and a path is its names each after a `/`.
const part = (name: string) => encodeURIComponent(name)
const pathPart = (path: readonly string[]) => path.map((name) => `/${part(name)}`).join('')
const pathFrom = (text: string) => (text === '' ? [] : text.split('/').slice(1).map(decodeURIComponent))

/** A Break node's id: the node whose value it takes apart, and where that value is in what the node gives. */
export const breakId = (source: string, path: readonly string[]) => `break:${part(source)}|${pathPart(path)}`

/** A Make node's id: the step whose argument it builds, and the argument. */
export const makeId = (target: string, key: string) => `make:${part(target)}|${part(key)}`

/** A condition node's id: the step whose Condition it is part of, and where it is among the Condition's nodes. */
export const conditionId = (target: string, at: readonly number[]) => `when:${part(target)}|${at.join('/')}`

/** Whether a node id is a Break's, a Make's or a condition node's, which the editor draws and the document holds no state for. */
export const isPureId = (id: string) => id.startsWith('break:') || id.startsWith('make:') || id.startsWith('when:')

/** The handle of an input pin, by its argument or field. */
export const inHandle = (key: string) => `in:${part(key)}`

/** The handle of an output pin, by where its value is in what the node gives. */
export const outHandle = (path: readonly string[]) => `out:${pathPart(path)}`

/** The handle a Break takes its object at, and the one a Make gives its object from. */
export const breakIn = 'break-in'
export const makeOut = 'make-out'

/** The handle a condition node gives its yes or no from. */
export const conditionOut = 'condition-out'

/** An input handle's argument or field; undefined for any other handle. */
export const inKey = (handle: string | null | undefined) => (handle?.startsWith('in:') ? decodeURIComponent(handle.slice(3)) : undefined)

/** An output handle's path; undefined for any other handle. */
export const outPath = (handle: string | null | undefined): string[] | undefined => (handle?.startsWith('out:') ? pathFrom(handle.slice(4)) : undefined)
