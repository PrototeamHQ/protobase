import { parseSource } from './project'

export type Registration = {
  from: string
  names: string[]
}

// Adds export declarations that are missing; existing ones are never reordered or removed.
export const ensureExports = (text: string, wanted: readonly Registration[]) => {
  const source = parseSource(text)
  for (const { from, names } of wanted) {
    const declaration = source.getExportDeclarations().find((d) => d.getModuleSpecifierValue() === from)
    if (!declaration) {
      source.addStatements(`export { ${names.join(', ')} } from '${from}'`)
      continue
    }
    const present = declaration.getNamedExports().map((e) => e.getName())
    declaration.addNamedExports(names.filter((name) => !present.includes(name)))
  }
  const result = source.getFullText()
  return result.endsWith('\n') ? result : `${result}\n`
}
