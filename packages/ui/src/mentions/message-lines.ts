// Markdown's line rules that chat habits beat, applied line by line outside code fences:
// - a line under a quote or a list item that is neither starts a block of its own, rather than joining it lazily;
// - a quote needs `> ` with a space, so `>5 failed logins` stays as typed;
// - a `---` or `___` line under text stays a line of that text.
// A backtick fence's info string holds no backtick, so ```inline``` is code within a line
const fence = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/
// A fence closes on a line of its marker, at least as long, and nothing after it but spaces
const closesFence = (line: string, open: string) => new RegExp(`^ {0,3}${open}[~\`]* *$`).test(line)
const quote = /^ {0,3}>/
const quoteAsTyped = /^( {0,3})>(?=[^ \t>])/
const listItem = /^ {0,3}([-*+]|\d{1,9}[.)])([ \t]|$)/
const rule = /^ {0,3}([-_])[ \t]*(\1[ \t]*){2,}$/
const indented = /^[ \t]/
// Text from the API or an import can end its lines with `\r\n` or a lone `\r`
const lineBreak = /\r\n?|\n/

/** A message's text with the chat line rules above made explicit for the markdown parser. */
export const chatLines = (text: string) => {
  const lines: string[] = []
  let inFence: string | undefined
  let inBlock = false
  for (const line of text.split(lineBreak)) {
    if (inFence) {
      if (closesFence(line, inFence)) inFence = undefined
      lines.push(line)
      continue
    }
    const marker = fence.exec(line)?.[1]
    if (marker) {
      inFence = marker
      inBlock = false
      lines.push(line)
      continue
    }
    const typed = line.replace(quoteAsTyped, '$1\\>').replace(rule, (match) => match.replace(/^ */, '$&\\'))
    const blank = typed.trim() === ''
    const opensBlock = quote.test(typed) || listItem.test(typed)
    if (inBlock && !blank && !opensBlock && !indented.test(typed)) lines.push('')
    inBlock = opensBlock || (inBlock && !blank && indented.test(typed))
    lines.push(typed)
  }
  return lines.join('\n')
}
