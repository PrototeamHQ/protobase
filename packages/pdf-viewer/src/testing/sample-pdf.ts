// A PDF of `objects`, the first its catalog, with the cross-reference table pointing at each, as a `data:` URL. Each
// object is text whose characters are its bytes.
const writePdf = (objects: string[]) => {
  let pdf = '%PDF-1.5\n'
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return `data:application/pdf;base64,${btoa(pdf)}`
}

const stream = (dictionary: string, content: string) => `<< ${dictionary} /Length ${content.length} >>\nstream\n${content}\nendstream`

/**
 * A PDF of A4 pages, each with one line of text in Helvetica, as a `data:` URL: a fixture for the stories, written out
 * so no binary file is checked in.
 */
export const samplePdf = (lines: string[]) => {
  const pageIds = lines.map((_, index) => 4 + index * 2)
  return writePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${lines.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...lines.flatMap((line, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index]! + 1} 0 R >>`,
      stream('', `BT /F1 48 Tf 72 700 Td (${line}) Tj ET`),
    ]),
  ])
}

// A 16 by 16 green image (0, 160, 0) in JPEG 2000, as a scanner writes them, which pdf.js decodes with its wasm decoder.
const greenJpx =
  'AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAEAAAABAAAwcHAAAAAAAPY29scgEAAAAAABAAAACqanAyY/9P/1EALwAAAAAAEAAAABAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAQEBAAB/1wAEEBASEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAJgAB/5PfgAgHx9QCBN+ACAeAgICAgICAgICAgID/2Q=='

/** A one-page PDF whose page is a green JPEG 2000 image, as a scanned page is, as a `data:` URL. */
export const jpxPdf = () =>
  writePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    stream('/Type /XObject /Subtype /Image /Width 16 /Height 16 /Filter /JPXDecode', atob(greenJpx)),
    stream('', 'q 200 0 0 200 0 0 cm /Im1 Do Q'),
  ])
