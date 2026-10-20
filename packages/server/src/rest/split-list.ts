import { parseError } from './rest-error'

const closers: Record<string, string> = { '(': ')', '{': '}' }

/**
 * Splits `text` at the commas outside double quotes, parentheses and braces: `a,in.(1,2),b.cs.{x,y}` gives three parts. A
 * backslash in quotes escapes the next character. An unclosed quote, parenthesis or brace does not parse.
 */
export const splitList = (text: string): string[] => {
  const parts: string[] = []
  const open: string[] = []
  let quoted = false
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '\\') i++
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char in closers) open.push(closers[char]!)
    else if (char === open.at(-1)) open.pop()
    else if (char === ',' && open.length === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  if (quoted || open.length > 0) throw parseError(`"${text}" has an unclosed quote, parenthesis or brace`)
  parts.push(text.slice(start))
  return parts
}

/** A value in double quotes without them and with its escapes undone; any other value as it is. */
export const unquote = (text: string) => (text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1).replace(/\\(.)/g, '$1') : text)
