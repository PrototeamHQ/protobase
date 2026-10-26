import { Node, type ObjectLiteralExpression } from 'ts-morph'
import { exportedConfigObject } from './config-object'

// The indentation of the line `node` starts on.
const indentOf = (text: string, node: Node) => {
  const lineStart = text.lastIndexOf('\n', node.getStart() - 1) + 1
  return /^[ \t]*/.exec(text.slice(lineStart))![0]
}

// `entries` added to `object` after its last property: on lines of their own when it spans lines, otherwise inline.
const withEntries = (text: string, object: ObjectLiteralExpression, entries: string[]) => {
  const last = object.getProperties().at(-1)
  if (!last) return `${text.slice(0, object.getStart())}{ ${entries.join(', ')} }${text.slice(object.getEnd())}`
  const at = last.getEnd() + (text[last.getEnd()] === ',' ? 1 : 0)
  if (!object.getText().includes('\n')) return `${text.slice(0, last.getEnd())}, ${entries.join(', ')}${text.slice(last.getEnd())}`
  const indent = indentOf(text, last)
  const comma = at === last.getEnd() ? ',' : ''
  return `${text.slice(0, at)}${comma}${entries.map((entry) => `\n${indent}${entry},`).join('')}${text.slice(at)}`
}

/**
 * `protobase.config.ts` declaring the jobs of `declarations` (each one entry of `jobs`, such as
 * `'purge': { schedule: '0 3 * * *' }`) named `names`: `existing` with them added to its `jobs`, or with a `jobs` of
 * them, or a new config when there is none. `undefined` when the file is not one it can change: it exports no object it
 * can see, its `jobs` is no object written out, or it declares one of these names already.
 */
export const configWithJobs = (existing: string | undefined, names: string[], declarations: string[]) => {
  if (existing === undefined) return `import { defineConfig } from '@protobase/config'\n\nexport default defineConfig({\n  jobs: {\n${declarations.map((entry) => `    ${entry},\n`).join('')}  },\n})\n`
  const { object } = exportedConfigObject(existing)
  if (!object) return undefined
  const jobs = object.getProperty('jobs')
  if (!jobs) return withEntries(existing, object, [`jobs: { ${declarations.join(', ')} }`])
  const declared = Node.isPropertyAssignment(jobs) ? jobs.getInitializer() : undefined
  if (!declared || !Node.isObjectLiteralExpression(declared)) return undefined
  if (names.some((name) => declared.getProperty(name) ?? declared.getProperty(`'${name}'`))) return undefined
  return withEntries(existing, declared, declarations)
}
