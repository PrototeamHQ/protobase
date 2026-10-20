/**
 * One piece of a pg_dump script: a statement up to and including its `;` (with a `COPY … FROM stdin;` statement's data
 * up to its `\.` line), a psql meta-command line such as `\restrict`, or the comments and whitespace between them.
 * Joining every piece's text gives the script back unchanged.
 */
export type Piece = { kind: 'statement' | 'meta' | 'gap'; text: string }

const copyFromStdin = /^COPY\s[\s\S]*\sFROM\s+stdin;$/i

/** Where the dollar quote opening at `at` ends, past its closing tag, or `undefined` when `at` opens none. */
const dollarQuoteEnd = (script: string, at: number) => {
  const tag = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(script.slice(at, at + 64))?.[0]
  if (!tag) return undefined
  const close = script.indexOf(tag, at + tag.length)
  if (close === -1) throw new Error(`Unterminated dollar quote ${tag} in the dump`)
  return close + tag.length
}

/** Where the quoted text opening at `at` with `quote` ends, past its closing quote. */
const quotedEnd = (script: string, at: number, quote: string, backslashEscapes: boolean) => {
  for (let i = at + 1; i < script.length; i++) {
    if (backslashEscapes && script[i] === '\\') i++
    else if (script[i] === quote && script[i + 1] === quote) i++
    else if (script[i] === quote) return i + 1
  }
  throw new Error('Unterminated quoted text in the dump')
}

const lineEnd = (script: string, at: number) => {
  const newline = script.indexOf('\n', at)
  return newline === -1 ? script.length : newline + 1
}

/** Where the block comment opening at `at` ends; they nest in Postgres. */
const blockCommentEnd = (script: string, at: number) => {
  let depth = 0
  for (let i = at; i < script.length - 1; i++) {
    if (script[i] === '/' && script[i + 1] === '*') (depth++, i++)
    else if (script[i] === '*' && script[i + 1] === '/') {
      i++
      if (--depth === 0) return i + 1
    }
  }
  throw new Error('Unterminated block comment in the dump')
}

/** Where a statement starting at `at` ends, past its `;`, skipping quoted text and comments. */
const statementEnd = (script: string, at: number) => {
  for (let i = at; i < script.length; ) {
    const char = script[i]!
    if (char === ';') return i + 1
    if (char === "'") i = quotedEnd(script, i, "'", /[Ee]/.test(script[i - 1] ?? '') && !/[A-Za-z_0-9]/.test(script[i - 2] ?? ''))
    else if (char === '"') i = quotedEnd(script, i, '"', false)
    else if (char === '-' && script[i + 1] === '-') i = lineEnd(script, i)
    else if (char === '/' && script[i + 1] === '*') i = blockCommentEnd(script, i)
    else if (char === '$' && !/[A-Za-z_0-9]/.test(script[i - 1] ?? '')) i = dollarQuoteEnd(script, i) ?? i + 1
    else i++
  }
  throw new Error(`Unterminated statement in the dump: ${script.slice(at, at + 80)}`)
}

/** Where a COPY statement's data ending at `at` ends, past its `\.` line. */
const copyDataEnd = (script: string, at: number) => {
  const start = lineEnd(script, at)
  const end = script.indexOf('\n\\.\n', start - 1)
  if (end === -1) throw new Error('Unterminated COPY data in the dump')
  return end + 4
}

/** Splits a pg_dump plain-text script into its pieces. */
export const splitDump = (script: string): Piece[] => {
  const pieces: Piece[] = []
  let gapStart = 0
  const flushGap = (to: number) => {
    if (to > gapStart) pieces.push({ kind: 'gap', text: script.slice(gapStart, to) })
  }
  for (let i = 0; i < script.length; ) {
    const char = script[i]!
    if (/\s/.test(char)) i++
    else if (char === '-' && script[i + 1] === '-') i = lineEnd(script, i)
    else if (char === '/' && script[i + 1] === '*') i = blockCommentEnd(script, i)
    else if (char === '\\') {
      flushGap(i)
      gapStart = lineEnd(script, i)
      pieces.push({ kind: 'meta', text: script.slice(i, gapStart) })
      i = gapStart
    } else {
      flushGap(i)
      const end = statementEnd(script, i)
      const withData = copyFromStdin.test(script.slice(i, end)) ? copyDataEnd(script, end) : end
      pieces.push({ kind: 'statement', text: script.slice(i, withData) })
      gapStart = i = withData
    }
  }
  flushGap(script.length)
  return pieces
}
