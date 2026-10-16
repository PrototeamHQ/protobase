// Line by line: what starts a block, which an excerpt leaves out
const blockMarks: Array<[RegExp, string]> = [
  [/^\s*(```|~~~).*$/, ''],
  [/^\s*\[[^\]]+\]:\s+\S.*$/, ''],
  [/^\s*([-*_]\s*){3,}$/, ''],
  [/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/, ''],
  [/^\s*#{1,6}\s+/, ''],
  [/^\s*(>\s?)+/, ''],
  [/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, ''],
]

// Within a line: the marks around text, which an excerpt keeps without them
const inlineMarks: Array<[RegExp, string]> = [
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/\[([^\]]+)\]\[[^\]]*\]/g, '$1'],
  [/<((?:https?|mailto):[^>\s]+)>/gi, '$1'],
  [/<\/?[a-z][^>]*>/gi, ''],
  [/`([^`]+)`/g, '$1'],
  [/(?<!\\)(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2'],
  [/(?<![\\\w*])\*(?=\S)(.+?)(?<=\S)\*/g, '$1'],
  [/(?<![\\\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1'],
  [/(?<!\\)~~(.+?)~~/g, '$1'],
  [/\s*\|\s*/g, ' '],
  [/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1'],
]

const longest = 200

/**
 * Markdown as one line of plain text, as a list's cell shows it: the text of its headings, lists, links and emphasis
 * without their marks, at most 200 characters.
 */
export const markdownExcerpt = (source: string) => {
  const lines = source.split(/\r?\n/).map((line) => blockMarks.reduce((text, [mark, kept]) => text.replace(mark, kept), line))
  const text = inlineMarks
    .reduce((joined, [mark, kept]) => joined.replace(mark, kept), lines.join('\n'))
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > longest ? `${text.slice(0, longest - 1).trimEnd()}…` : text
}
