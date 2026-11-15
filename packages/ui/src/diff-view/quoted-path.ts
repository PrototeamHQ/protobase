// Git quotes a path holding a quote, a backslash, a control character or, by default, a non-ASCII byte, as C does:
// `"a/caf\303\251 \"menu\".txt"`, octal escapes being the bytes of its UTF-8 (git-config's core.quotePath).

const escapes: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 }
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The path a quoted name at the start of `text` holds and the text after its closing quote, or `undefined` when it is not one. */
export const readQuoted = (text: string): { path: string; rest: string } | undefined => {
  if (!text.startsWith('"')) return
  const bytes: number[] = []
  let index = 1
  while (index < text.length) {
    const char = String.fromCodePoint(text.codePointAt(index)!)
    if (char === '"') return { path: decoder.decode(new Uint8Array(bytes)), rest: text.slice(index + 1) }
    if (char !== '\\') {
      bytes.push(...encoder.encode(char))
      index += char.length
      continue
    }
    const octal = /^[0-3][0-7]{2}/.exec(text.slice(index + 1))
    if (octal) {
      bytes.push(parseInt(octal[0], 8))
      index += 4
      continue
    }
    const escaped = escapes[text[index + 1] ?? '']
    if (escaped === undefined) return
    bytes.push(escaped)
    index += 2
  }
  return
}
