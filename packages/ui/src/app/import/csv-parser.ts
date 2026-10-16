const delimiters = [',', ';', '\t'] as const

/**
 * The delimiter of a CSV's header line: whichever of comma, semicolon and tab it holds most often outside quotes, a
 * comma when it holds none (a file of one column).
 */
export const detectDelimiter = (headerLine: string) => {
  const counts = new Map<string, number>(delimiters.map((delimiter) => [delimiter, 0]))
  let quoted = false
  for (const char of headerLine) {
    if (char === '"') quoted = !quoted
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1)
  }
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [',', 0] as [string, number])[0]
}

// The header line of the text so far, up to its first line break outside quotes; undefined while it has none.
const firstLine = (text: string) => {
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === '\n' || char === '\r')) return text.slice(0, index)
  }
  return undefined
}

/**
 * A CSV parser fed text a chunk at a time (RFC 4180: quoted fields with `""` for a quote and line breaks inside, CRLF,
 * LF or CR between rows), so a large file is read without holding it whole. `push` returns the rows completed by the
 * chunk, `end` the last one. The delimiter is the header line's (`detectDelimiter`) unless given; a byte order mark at
 * the start is dropped.
 */
export const createCsvParser = (given?: string) => {
  let delimiter = given
  let pending = ''
  let started = false
  let field = ''
  let row: string[] = []
  let quoted = false
  // A quote inside a quoted field: the field's end, or the first of a `""` pair
  let quoteSeen = false
  // A CR ended the row: an LF straight after it belongs to the same line break
  let crSeen = false
  // Whether the current row has anything yet, so the line break ending the file makes no row of its own
  let rowStarted = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = (rows: string[][]) => {
    endField()
    rows.push(row)
    row = []
    rowStarted = false
  }

  const consume = (text: string) => {
    const rows: string[][] = []
    for (const char of text) {
      if (crSeen) {
        crSeen = false
        if (char === '\n') continue
      }
      if (quoted) {
        if (quoteSeen) {
          quoteSeen = false
          if (char === '"') {
            field += '"'
            continue
          }
          quoted = false
        } else if (char === '"') {
          quoteSeen = true
          continue
        } else {
          field += char
          continue
        }
      }
      if (char === '"' && field === '') {
        quoted = true
        rowStarted = true
      } else if (char === delimiter) {
        endField()
        rowStarted = true
      } else if (char === '\n' || char === '\r') {
        crSeen = char === '\r'
        endRow(rows)
      } else {
        field += char
        rowStarted = true
      }
    }
    return rows
  }

  const push = (chunk: string) => {
    if (started) return consume(chunk)
    pending += chunk
    if (pending.charCodeAt(0) === 0xfeff) pending = pending.slice(1)
    const header = firstLine(pending)
    if (header === undefined) return []
    started = true
    delimiter ??= detectDelimiter(header)
    const text = pending
    pending = ''
    return consume(text)
  }

  const end = () => {
    const rows = started ? [] : push('\n')
    if (quoteSeen) {
      quoteSeen = false
      quoted = false
    }
    if (rowStarted || field !== '') endRow(rows)
    return rows
  }

  return { push, end, delimiter: () => delimiter }
}
