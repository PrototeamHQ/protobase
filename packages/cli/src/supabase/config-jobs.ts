import { Node, SyntaxKind } from 'ts-morph'
import { parseSource } from '../scaffold/project'

const jobsImport = "import * as jobs from './jobs'"

/** What `protobase.config.ts` says when the import writes it: the jobs of `jobs/`, and the config by its convention. */
const newConfig = `${jobsImport}\n\nexport default { jobs }\n`

/** The object `protobase.config.ts` exports by default, written out or passed to a call such as `defineConfig`. */
const exportedObject = (text: string) => {
  const source = parseSource(text, 'protobase.config.ts')
  const exported = source.getExportAssignment((assignment) => !assignment.isExportEquals())?.getExpression()
  const object = Node.isCallExpression(exported) ? exported.getArguments()[0] : exported
  return { source, object: Node.isObjectLiteralExpression(object) ? object : undefined }
}

/**
 * `protobase.config.ts` passing the jobs of `jobs/` as its `jobs`: `existing`, with an import of them and the property
 * added, or a new file when there is none. It is `existing` itself when it imports `./jobs` already, and `undefined`
 * when the file is not one it can change: it names a `jobs` of its own, or exports no object it can see.
 */
export const configWithJobs = (existing: string | undefined) => {
  if (existing === undefined) return newConfig
  const { source, object } = exportedObject(existing)
  const imported = source.getImportDeclarations().some((declaration) => declaration.getModuleSpecifierValue() === './jobs')
  if (imported) return existing
  if (!object || source.getDescendantsOfKind(SyntaxKind.Identifier).some((identifier) => identifier.getText() === 'jobs')) return undefined
  // Edits the text at the nodes' places, so the file keeps its own layout; imports come before the export.
  const last = object.getProperties().at(-1)
  const withProperty = last
    ? `${existing.slice(0, last.getEnd())}, jobs${existing.slice(last.getEnd())}`
    : `${existing.slice(0, object.getStart())}{ jobs }${existing.slice(object.getEnd())}`
  const importsEnd = source.getImportDeclarations().at(-1)?.getEnd()
  if (importsEnd === undefined) return `${jobsImport}\n\n${withProperty}`
  return `${withProperty.slice(0, importsEnd)}\n${jobsImport}${withProperty.slice(importsEnd)}`
}
