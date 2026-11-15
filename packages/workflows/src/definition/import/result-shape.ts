import { expressionSource, parse } from '../expressions'
import { expressionReads } from '../reads'

/**
 * The HTTP task's result, `{ StatusCode, StatusText, Headers, ResponseBody }` with each header's values as a list, as
 * JSONata built from app:http's `{ status, status_text, headers, body }`.
 */
export const httpTaskResult =
  '({ "StatusCode": $states.result.status, "StatusText": $states.result.status_text, "Headers": $merge([{}, $each($states.result.headers, function($value, $name) { { $name: [$value] } })]), "ResponseBody": $states.result.body })'

// How many times httpTaskResult reads $states.result
const readsPerResult = 4

const read = '$states.result'
const nameCharacter = /[\w$]/
// The characters an operand ends with: a `/` after one divides, after anything else it opens a regular expression.
const operandEnd = /[\w$)\]}"'`]/

// Where a string, a backtick name or a regular expression opened at `start` closes, past its closing character; a
// backslash escapes the next character.
const closing = (source: string, start: number) => {
  const quote = source[start]
  for (let at = start + 1; at < source.length; at++) {
    if (source[at] === '\\') at++
    else if (source[at] === quote) return at + 1
  }
  return source.length
}

const lastSignificant = (text: string) => text.trimEnd().at(-1) ?? ''

// The expression with each `$states.result` written out replaced, outside strings, names in backticks, regular
// expressions and comments, with how many it replaced.
const replaced = (source: string) => {
  let rewritten = ''
  let count = 0
  let at = 0
  while (at < source.length) {
    const character = source[at]!
    const regex = character === '/' && source[at + 1] !== '*' && !operandEnd.test(lastSignificant(rewritten))
    if (character === '"' || character === "'" || character === '`' || regex) {
      const end = closing(source, at)
      rewritten += source.slice(at, end)
      at = end
      continue
    }
    if (source.startsWith('/*', at)) {
      const end = source.indexOf('*/', at + 2)
      const stop = end === -1 ? source.length : end + 2
      rewritten += source.slice(at, stop)
      at = stop
      continue
    }
    if (source.startsWith(read, at) && !nameCharacter.test(source[at + read.length] ?? '') && !nameCharacter.test(source[at - 1] ?? '')) {
      rewritten += httpTaskResult
      count++
      at += read.length
      continue
    }
    rewritten += character
    at++
  }
  return { rewritten, count }
}

// How many times an expression reads $states.result, by its syntax tree; a read of $states as a whole reads it too.
const resultReads = (source: string) => {
  const parsed = parse(source)
  if ('error' in parsed) return
  const states = expressionReads(parsed.expression).states
  return { count: states.filter((path) => path[0] === 'result').length, whole: states.some((path) => path.length === 0) }
}

/**
 * The expression with each read of `$states.result` reading the HTTP task's result, so `$states.result.ResponseBody`
 * reads the body and a variable given the whole result keeps the HTTP task's shape; `undefined` when a read is written
 * in a form the rewrite does not reach, such as `$states . result`, which the syntax tree tells. An expression that does
 * not parse is left as it is, for the check to refuse.
 */
export const withHttpTaskResult = (source: string): string | undefined => {
  const before = resultReads(source)
  if (!before) return source
  const { rewritten, count } = replaced(source)
  const after = resultReads(rewritten)
  if (before.whole || before.count !== count || after?.count !== count * readsPerResult) return
  return rewritten
}

/**
 * A template, such as an `Output` or an `Assign`, with every expression in it reading the HTTP task's result, and the
 * path of each expression whose reads the rewrite does not reach.
 */
export const templateWithHttpTaskResult = (value: unknown, path: (string | number)[] = []): { value: unknown; unreached: (string | number)[][] } => {
  const source = expressionSource(value)
  if (source !== undefined) {
    const rewritten = withHttpTaskResult(source)
    return rewritten === undefined ? { value, unreached: [path] } : { value: `{%${rewritten}%}`, unreached: [] }
  }
  if (Array.isArray(value)) {
    const items = value.map((item, index) => templateWithHttpTaskResult(item, [...path, index]))
    return { value: items.map((item) => item.value), unreached: items.flatMap((item) => item.unreached) }
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(([key, item]) => [key, templateWithHttpTaskResult(item, [...path, key])] as const)
    return { value: Object.fromEntries(entries.map(([key, item]) => [key, item.value])), unreached: entries.flatMap(([, item]) => item.unreached) }
  }
  return { value, unreached: [] }
}
