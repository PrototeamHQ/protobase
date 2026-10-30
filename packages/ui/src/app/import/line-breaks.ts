// Where the reader stands: at a field's start, in an unquoted field, in a quoted one, or just past a quote inside a
// quoted field (its end, or the first of a `""` pair)
type State = 'start' | 'unquoted' | 'quoted' | 'quoteSeen'

/**
 * Turns every CR and CRLF between rows into an LF, a chunk of CSV text at a time, so a file whose rows end in mixed
 * line breaks reads as one: papaparse takes a single line break per file. A quote opens a quoted field only at a
 * field's start, as papaparse reads it, and line breaks inside quoted fields are cell text and stay as they are.
 */
export const createLineBreakNormalizer = (delimiter: string) => {
  let state: State = 'start'
  // A CR just became an LF: an LF straight after it, also at the next chunk's start, is the same line break
  let crSeen = false

  const push = (chunk: string) => {
    let out = ''
    for (const char of chunk) {
      if (crSeen) {
        crSeen = false
        if (char === '\n') continue
      }
      if (state === 'quoted') {
        if (char === '"') state = 'quoteSeen'
        out += char
        continue
      }
      if (state === 'quoteSeen') {
        state = 'quoted'
        if (char === '"') {
          out += char
          continue
        }
        state = 'unquoted'
      }
      if (char === '\r' || char === '\n') {
        crSeen = char === '\r'
        state = 'start'
        out += '\n'
      } else if (char === '"' && state === 'start') {
        state = 'quoted'
        out += char
      } else {
        state = char === delimiter ? 'start' : 'unquoted'
        out += char
      }
    }
    return out
  }

  return { push }
}
