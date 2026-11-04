/**
 * Why a definition cannot be saved. `state` is the state's path: its name, or names joined by `/` inside a Map's item
 * processor or a Parallel's branch (`Each/Fetch`, `Both/1/Mail`); `field` is the field within it, such as `Retry[0].IntervalSeconds`.
 */
export type Problem = { state?: string; field?: string; message: string }

/** A problem as one line: `State "Fetch", field "Arguments.url": ...`. */
export const problemText = ({ state, field, message }: Problem) => {
  const where = [state !== undefined && `state "${state}"`, field !== undefined && `field "${field}"`].filter(Boolean).join(', ')
  if (!where) return message
  return `${where.charAt(0).toUpperCase()}${where.slice(1)}: ${message}`
}

/** A field path as `Retry[0].IntervalSeconds`. */
export const fieldPath = (parts: readonly (string | number)[]) =>
  parts.reduce<string>((path, part) => (typeof part === 'number' || /^\d+$/.test(part) ? `${path}[${part}]` : path ? `${path}.${part}` : part), '')
