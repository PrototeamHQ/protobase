// Handlebars path expressions, the subset a placeholder `{{path}}` and a layout's `source` take: no helpers,
// subexpressions, literals or `@key`. https://handlebarsjs.com/guide/expressions.html#path-expressions

const name = '[A-Za-z_][A-Za-z0-9_]*'
const segments = `${name}(?:\\.${name})*`
const pathSource = `@(?:root|params)(?:\\.${segments})?|@index|@first|@last|(?:\\.\\./)*(?:this(?:\\.${segments})?|\\./${segments}|${segments})`

const wholePath = new RegExp(`^(?:${pathSource})$`)

/** A `{{…}}` with anything inside but braces, so a placeholder that is no path is found and refused, not left as text. */
const placeholder = /\{\{\s*([^{}]*?)\s*\}\}/g

/** A data variable the renderer supplies (`@root`, `@params`, `@index`, `@first`, `@last`), or a name in the context stack. */
export type TemplatePath =
  | { kind: 'data'; variable: 'root' | 'params' | 'index' | 'first' | 'last'; names: string[] }
  /**
   * `up` is how many `../` lead it; `explicit` is true for `this`, `./` and any `../`, which read one context only, where
   * a bare name searches the stack. `names` is empty for `this` alone.
   */
  | { kind: 'context'; up: number; explicit: boolean; names: string[] }

/** The path `text` is, or `undefined` when it is none, such as `a b`, `@key` or `../@root`. */
export const parseTemplatePath = (text: string): TemplatePath | undefined => {
  if (!wholePath.test(text)) return
  if (text.startsWith('@')) {
    const [variable, ...names] = text.slice(1).split('.')
    return { kind: 'data', variable: variable as 'root' | 'params' | 'index' | 'first' | 'last', names }
  }
  let rest = text
  let up = 0
  while (rest.startsWith('../')) {
    rest = rest.slice(3)
    up += 1
  }
  if (rest === 'this') return { kind: 'context', up, explicit: true, names: [] }
  if (rest.startsWith('this.')) return { kind: 'context', up, explicit: true, names: rest.slice(5).split('.') }
  if (rest.startsWith('./')) return { kind: 'context', up, explicit: true, names: rest.slice(2).split('.') }
  return { kind: 'context', up, explicit: up > 0, names: rest.split('.') }
}

/** Each `{{…}}` in `text`, as written between the braces, in order and repeated as often as it is. */
export const templatePlaceholders = (text: string) => [...text.matchAll(placeholder)].map((match) => match[1]!)

/** `text` with every `{{path}}` replaced by `value(path)`; a placeholder that is no path is replaced too, by what `value` gives it. */
export const fillPlaceholders = (text: string, value: (path: string) => string) => text.replace(placeholder, (_, path: string) => value(path))

/** A placeholder holding only a path, such as `{{website}}`: the path, or `undefined` when `text` is more than that. */
export const wholePlaceholder = (text: string) => {
  const match = /^\{\{\s*([^{}]*?)\s*\}\}$/.exec(text)
  return match && parseTemplatePath(match[1]!) ? match[1] : undefined
}

/**
 * The value at `path` in one record, as Mustache reads a single context: the first name from the record, the rest from
 * that value only. Anything that needs another context (`../`, `@root`) has none here, so it is `undefined`.
 */
export const recordValueAt = (record: Record<string, unknown>, path: string): unknown => {
  const parsed = parseTemplatePath(path)
  if (!parsed || parsed.kind !== 'context' || parsed.up > 0) return
  return parsed.names.reduce<unknown>((value, key) => (typeof value === 'object' && value !== null && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined), record)
}
