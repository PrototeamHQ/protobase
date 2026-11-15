import { expressionSource } from '../expressions'

/**
 * The HTTP task's result, `{ StatusCode, StatusText, Headers, ResponseBody }` with each header's values as a list, as
 * JSONata built from app:http's `{ status, status_text, headers, body }`.
 */
export const httpTaskResult =
  '({ "StatusCode": $states.result.status, "StatusText": $states.result.status_text, "Headers": $merge([{}, $each($states.result.headers, function($value, $name) { { $name: [$value] } })]), "ResponseBody": $states.result.body })'

const read = '$states.result'
const nameCharacter = /[\w$]/

// Where a string or a backtick name opened at `start` closes, past its closing quote; a backslash escapes the next character.
const closing = (source: string, start: number) => {
  const quote = source[start]
  for (let at = start + 1; at < source.length; at++) {
    if (source[at] === '\\') at++
    else if (source[at] === quote) return at + 1
  }
  return source.length
}

/**
 * The expression with each read of `$states.result` replaced, outside strings, names in backticks and comments, so
 * `$states.result.ResponseBody` reads the body and a variable given the whole result keeps the HTTP task's shape.
 */
export const withHttpTaskResult = (source: string) => {
  let rewritten = ''
  let at = 0
  while (at < source.length) {
    const character = source[at]!
    if (character === '"' || character === "'" || character === '`') {
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
    const whole = source.startsWith(read, at) && !nameCharacter.test(source[at + read.length] ?? '') && !nameCharacter.test(source[at - 1] ?? '')
    if (whole) {
      rewritten += httpTaskResult
      at += read.length
      continue
    }
    rewritten += character
    at++
  }
  return rewritten
}

/** A template, such as an `Output` or an `Assign`, with every expression in it reading the HTTP task's result. */
export const templateWithHttpTaskResult = (value: unknown): unknown => {
  const source = expressionSource(value)
  if (source !== undefined) return `{%${withHttpTaskResult(source)}%}`
  if (Array.isArray(value)) return value.map(templateWithHttpTaskResult)
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, templateWithHttpTaskResult(item)]))
  return value
}
