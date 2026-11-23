// Text from the API or an import can end its lines with `\r\n` or a lone `\r`
const lineBreak = /\r\n?|\n/

/** The text's paragraphs, as markdown reads them: runs of lines between blank ones, each run's lines joined by `\n`. */
export const paragraphsOf = (text: string) => {
  const paragraphs: string[][] = [[]]
  for (const line of text.split(lineBreak)) {
    if (line.trim() === '') paragraphs.push([])
    else paragraphs.at(-1)!.push(line)
  }
  return paragraphs.filter((lines) => lines.length > 0).map((lines) => lines.join('\n'))
}
