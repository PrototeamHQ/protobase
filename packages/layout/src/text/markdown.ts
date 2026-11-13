import { enumLabel } from '@protobase/schema'

// The Markdown primitives every block's text form is made of. Each takes plain text and returns Markdown.

/** Plain text as Markdown that reads the same: the characters Markdown would take as markup are escaped. */
export const escapeMarkdown = (text: string) =>
  text
    .replace(/[\\`*_~[\]<>]/g, '\\$&')
    .replace(/^(\s*)([#>+-])(?=\s|$)/gm, '$1\\$2')
    .replace(/^(\s*\d+)\.(?=\s|$)/gm, '$1\\.')

/** A heading of `level`, 1 to 6. */
export const heading = (level: number, text: string) => (text === '' ? '' : `${'#'.repeat(level)} ${text}`)

export const strong = (text: string) => (text === '' ? '' : `**${text}**`)

/** A link; with no text of its own it shows its target. */
export const link = (text: string, href: string) => `[${text === '' ? escapeMarkdown(href) : text}](${href.replace(/[ ()]/g, encodeURIComponent)})`

export const image = (alt: string, src: string) => `![${alt}](${src.replace(/[ ()]/g, encodeURIComponent)})`

/** A bullet list, one item per line. */
export const list = (items: string[]) => items.map((item) => `- ${item}`).join('\n')

// Backticks longer than any run of them in the text, so the text cannot close its code
const ticksAround = (text: string, least: number) => '`'.repeat(Math.max(least, Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1))

/** Text as inline code, as it reads, whatever backticks it holds. */
export const code = (text: string) => {
  const ticks = ticksAround(text, 1)
  return ticks.length > 1 ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`
}

/** Text as a fenced code block in `language`, its fence longer than any run of backticks in the text. */
export const fenced = (text: string, language = '') => {
  const fence = ticksAround(text, 3)
  return `${fence}${language}\n${text}\n${fence}`
}

/** A value as a fenced JSON block. */
export const json = (value: unknown) => fenced(JSON.stringify(value, null, 2), 'json')

/** A label and its value on one line; a value made of lines goes under the label. */
export const labelled = (label: string, value: string) => {
  if (label === '') return value
  if (value === '') return strong(label)
  return value.includes('\n') ? `${strong(label)}\n\n${value}` : `${strong(label)}: ${value}`
}

/** A dash for no value, which a reader takes as empty. */
export const emptyValue = '—'

/**
 * A stored value as text: a dash when empty, an enum value as its label in `valueLabels`, a list as its items, an
 * object as a JSON block, and anything else as itself.
 */
export const valueText = (value: unknown, valueLabels?: Record<string, string>): string => {
  if (value === null || value === undefined || value === '') return emptyValue
  if (typeof value === 'string') return escapeMarkdown(enumLabel(value, valueLabels))
  if (Array.isArray(value) && value.every((item) => typeof item !== 'object' || item === null)) return value.map((item) => valueText(item, valueLabels)).join(', ')
  if (typeof value === 'object') return json(value)
  return String(value)
}

/** Parts that each stand alone, such as paragraphs, with a blank line between them; empty parts are left out. */
export const blocks = (parts: string[], separator = '\n\n') => parts.filter((part) => part !== '').join(separator)
