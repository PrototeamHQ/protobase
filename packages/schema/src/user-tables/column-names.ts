import { maxNameBytes, reservedFieldNames } from './names'
import { reservedWords } from './reserved-words'

// Names made only of a-z, 0-9 and _: letters lose their accents, anything else becomes one _
const snakeOf = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

// A name starts with a letter and fits; these names are ASCII, so a character is a byte
const fitted = (name: string, prefix: string, maxBytes: number) => (/^[a-z]/.test(name) ? name : `${prefix}_${name}`).slice(0, maxBytes).replace(/_+$/, '')

// The name, or the first of `name_2`, `name_3` and so on that is neither taken nor a word SQL reserves
const unique = (name: string, taken: ReadonlySet<string>, maxBytes: number) => {
  let candidate = name
  for (let next = 2; taken.has(candidate) || reservedWords.has(candidate); next++) {
    const suffix = `_${next}`
    candidate = `${name.slice(0, maxBytes - suffix.length).replace(/_+$/, '')}${suffix}`
  }
  return candidate
}

/** A spreadsheet's letters for column `index`, in lower case: 0 is `a`, 27 is `ab`. */
const columnLetters = (index: number): string => (index < 26 ? String.fromCharCode(97 + index) : columnLetters(Math.floor(index / 26) - 1) + columnLetters(index % 26))

/**
 * The field names of a file's columns from their headers, in order: each in snake_case, `column_<letters>` (its
 * letters in the file) for a header with no letters or digits, and a name that repeats an earlier one, is a word SQL
 * reserves or a name every table's field has (`id`, `etag`, `organization_id`) with `_2`, `_3` and so on after it.
 * Two headers never share a name.
 */
export const fieldNamesOf = (headers: readonly string[]) => {
  const taken = new Set(reservedFieldNames)
  return headers.map((header, index) => {
    const snake = snakeOf(header)
    const name = unique(snake === '' ? `column_${columnLetters(index)}` : fitted(snake, 'column', maxNameBytes), taken, maxNameBytes)
    taken.add(name)
    return name
  })
}

/**
 * A table's name from a file's name, without its extension, in snake_case, and with `_2`, `_3` and so on after it when
 * a name in `taken`, such as the app's resources, or a word SQL reserves has it; `undefined` when the name has no
 * letters or digits. `maxBytes` is 42 in an app with organizations.
 */
export const tableNameOf = (fileName: string, taken: Iterable<string> = [], maxBytes = maxNameBytes) => {
  const snake = snakeOf(fileName.replace(/\.(csv|tsv|txt|xlsx|json)$/i, ''))
  if (snake === '') return
  return unique(fitted(snake, 'table', maxBytes), new Set(taken), maxBytes)
}
