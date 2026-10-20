/**
 * A token of one SQL statement: a word (keyword or unquoted name), a quoted name, a string or other literal, or a
 * punctuation character. `word` is a word or quoted name as Postgres resolves it: unquoted folded to lowercase, quoted
 * as written; other tokens have none, so text inside a string never reads as a keyword or name.
 */
export type Token = { start: number; end: number; word?: string; depth: number }

/** The tokens of `statement` outside comments, each with how deep in parentheses it sits. */
export const tokenize = (statement: string): Token[] => {
  const tokens: Token[] = []
  let depth = 0
  for (let i = 0; i < statement.length; ) {
    const char = statement[i]!
    const rest = statement.slice(i)
    if (/\s/.test(char)) i++
    else if (rest.startsWith('--')) i = statement.indexOf('\n', i) === -1 ? statement.length : statement.indexOf('\n', i) + 1
    else if (rest.startsWith('/*')) i = statement.indexOf('*/', i) + 2
    else if (char === '"') {
      const end = /^"(?:[^"]|"")*"/.exec(rest)![0].length + i
      tokens.push({ start: i, end, word: statement.slice(i + 1, end - 1).replaceAll('""', '"'), depth })
      i = end
    } else if (char === "'") {
      const end = /^'(?:[^']|'')*'/.exec(rest)![0].length + i
      tokens.push({ start: i, end, depth })
      i = end
    } else if (/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.test(rest)) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(rest)![0]
      const end = statement.indexOf(tag, i + tag.length) + tag.length
      tokens.push({ start: i, end, depth })
      i = end
    } else if (/[A-Za-z_]/.test(char)) {
      const end = /^[A-Za-z_][A-Za-z_0-9$]*/.exec(rest)![0].length + i
      // E'…', U&'…' and B'…' literals: the prefix and the string are one literal.
      if (statement[end] === "'" && /^(?:[EeBbXxNn])$/.test(statement.slice(i, end))) {
        const close = /^'(?:[^'\\]|''|\\.)*'/.exec(statement.slice(end))![0].length + end
        tokens.push({ start: i, end: close, depth })
        i = close
      } else {
        tokens.push({ start: i, end, word: statement.slice(i, end).toLowerCase(), depth })
        i = end
      }
    } else if (/[0-9]/.test(char)) {
      const end = /^[0-9.]+(?:[eE][+-]?[0-9]+)?/.exec(rest)![0].length + i
      tokens.push({ start: i, end, depth })
      i = end
    } else {
      if (char === ')') depth--
      tokens.push({ start: i, end: i + 1, depth })
      if (char === '(') depth++
      i++
    }
  }
  return tokens
}

/** Whether the tokens from `at` on are the words `words`, outside quotes. */
export const wordsAt = (statement: string, tokens: Token[], at: number, words: string[]) =>
  words.every((word, i) => {
    const token = tokens[at + i]
    return token !== undefined && token.word === word && statement[token.start] !== '"'
  })
