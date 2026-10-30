import Papa from 'papaparse'
import { createLineBreakNormalizer } from './line-breaks'

// Where the header line ends: its first line break outside quotes; undefined while the text has none. Papaparse
// guesses a delimiter from field counts over several rows, which a blank or short row throws off, so the guess is made
// on the header line alone, found here.
const headerEnd = (text: string) => {
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === '\n' || char === '\r')) return index
  }
  return
}

// The delimiter the header line uses most of comma, semicolon and tab, a comma when it holds none (a file of one column)
const headerDelimiter = (header: string): string =>
  Papa.parse(header, { delimitersToGuess: [',', ';', '\t'] }).meta.delimiter

/**
 * A CSV parser fed text a chunk at a time, so a large file is read without holding it whole: papaparse's (RFC 4180,
 * quoted fields with `""` for a quote and line breaks inside), with the header line's delimiter and rows ended by CRLF,
 * LF or CR, mixed if need be. `push` returns the rows completed by the chunk, `end` the last one; the line break ending
 * the file makes no row of its own. A byte order mark at the start is dropped.
 */
export const createCsvParser = () => {
  // The raw text until the header line is whole, then the normalized text of the row not yet finished
  let pending = ''
  let started: { parser: Papa.Parser; normalizer: ReturnType<typeof createLineBreakNormalizer> } | undefined

  const start = (end: number) => {
    const delimiter = headerDelimiter(pending.slice(0, end))
    const normalizer = createLineBreakNormalizer(delimiter)
    started = { parser: new Papa.Parser({ delimiter, newline: '\n' }), normalizer }
    pending = normalizer.push(pending)
    return started
  }

  // The rows the text completes, keeping the unfinished last row for the next chunk
  const completed = (parser: Papa.Parser): string[][] => {
    const result = parser.parse(pending, 0, true)
    pending = pending.slice(result.meta.cursor)
    return result.data
  }

  const push = (chunk: string) => {
    if (started) {
      pending += started.normalizer.push(chunk)
      return completed(started.parser)
    }
    pending += chunk
    if (pending.charCodeAt(0) === 0xfeff) pending = pending.slice(1)
    const end = headerEnd(pending)
    if (end === undefined) return []
    return completed(start(end).parser)
  }

  const end = () => {
    if (!started && pending === '') return []
    const { parser } = started ?? start(headerEnd(pending) ?? pending.length)
    const rows = completed(parser)
    if (pending === '') return rows
    const last: string[][] = parser.parse(pending, 0, false).data
    pending = ''
    return [...rows, ...last]
  }

  return { push, end }
}
