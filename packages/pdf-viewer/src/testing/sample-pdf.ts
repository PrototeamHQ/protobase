/**
 * A PDF of A4 pages, each with one line of text in Helvetica, as a `data:` URL: a fixture for the stories, written out
 * so no binary file is checked in.
 */
export const samplePdf = (lines: string[]) => {
  const pageIds = lines.map((_, index) => 4 + index * 2)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${lines.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...lines.flatMap((line, index) => {
      const content = `BT /F1 48 Tf 72 700 Td (${line}) Tj ET`
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index]! + 1} 0 R >>`,
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      ]
    }),
  ]
  let pdf = '%PDF-1.4\n'
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
