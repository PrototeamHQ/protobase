import { inflateSync } from 'node:zlib'

// The text a PDF of React PDF's shows in its standard fonts, run together: each content stream inflated, and the hex
// strings it draws (`<48656c6c6f> Tj`, or kerned in a `TJ` array) read as Latin-1, a line per stream.
export const pdfText = (bytes: Uint8Array) => {
  const pdf = Buffer.from(bytes)
  const lines: string[] = []
  let at = pdf.indexOf('stream\n')
  while (at !== -1) {
    const start = at + 'stream\n'.length
    const end = pdf.indexOf('\nendstream', start)
    const content = inflateSync(pdf.subarray(start, end)).toString('latin1')
    const drawn = [...content.matchAll(/<([0-9a-f]+)>/gi)].map(([, hex]) => Buffer.from(hex!, 'hex').toString('latin1'))
    if (/\bT[Jj]\b/.test(content)) lines.push(drawn.join(''))
    at = pdf.indexOf('stream\n', end + '\nendstream'.length)
  }
  return lines.join('\n')
}
