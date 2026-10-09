import { IndentationText, Project, QuoteKind } from 'ts-morph'

const project = new Project({
  useInMemoryFileSystem: true,
  skipAddingFilesFromTsConfig: true,
  manipulationSettings: { indentationText: IndentationText.TwoSpaces, quoteKind: QuoteKind.Single },
})

// Parses text as a throwaway TypeScript file; the real files are read and written by the caller.
export const parseSource = (text: string, name = 'source.ts') =>
  project.createSourceFile(name, text, { overwrite: true })
