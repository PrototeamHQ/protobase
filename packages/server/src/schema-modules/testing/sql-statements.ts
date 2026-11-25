// The statements of a migration, for comparing what two of them write whatever their order and layout: without
// comments, each once, a dollar-quoted body such as a function's kept whole.
export const sqlStatements = (text: string) => {
  const bodies: string[] = []
  const masked = text.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, (body) => `$body${bodies.push(body) - 1}$`)
  const split = masked.split(/;\s*(?:\n|$)/).map((statement) => statement.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n').trim())
  return new Set(split.filter(Boolean).map((statement) => statement.replace(/\$body(\d+)\$/g, (_, index: string) => bodies[Number(index)]!)))
}
