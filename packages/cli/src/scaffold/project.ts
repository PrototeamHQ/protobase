import { IndentationText, Project, QuoteKind } from 'ts-morph'

const project = new Project({
  useInMemoryFileSystem: true,
  skipAddingFilesFromTsConfig: true,
  // A property added to a multi-line object ends with a comma, as the ones scaffold writes do.
  manipulationSettings: { indentationText: IndentationText.TwoSpaces, quoteKind: QuoteKind.Single, useTrailingCommas: true },
})

// Parses text as a throwaway TypeScript file; the real files are read and written by the caller.
export const parseSource = (text: string, name = 'source.ts') =>
  project.createSourceFile(name, text, { overwrite: true })
