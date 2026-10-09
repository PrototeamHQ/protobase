import { Node, SyntaxKind } from 'ts-morph'
import { humanize, humanizeSingular } from '../infer/names'
import { methodCalls } from './existing-config'
import { parseSource } from './project'

export type UiSection = 'names' | 'list'

export type UiField = {
  name: string
  type: string
  role: 'key' | 'tenant' | 'softDelete' | 'plain'
}

export type UiTarget = {
  // Resource name, e.g. "orderLines" for `sales.order_lines`.
  resource: string
  tableName: string
  fields: UiField[]
}

const auditField = /^(created|updated)(At|On)$/
const longText = /^(notes?|description|body|comment|comments)$/
const listSize = 5

// The first useful fields: plain scalars first, then relations, falling back to the key.
export const listColumns = (fields: UiField[]) => {
  const plain = fields.filter((f) => f.role === 'plain' && f.type !== 'json' && !auditField.test(f.name))
  const scalars = plain.filter((f) => f.type !== 'relation' && !longText.test(f.name))
  const relations = plain.filter((f) => f.type === 'relation')
  const picked = [...scalars.slice(0, listSize), ...(scalars.length < 3 ? relations : [])].slice(0, listSize)
  return (picked.length > 0 ? picked : fields.filter((f) => f.role === 'key')).map((f) => f.name)
}

export const viewName = (resource: string) => `${resource}View`

const sectionText: Record<UiSection, (target: UiTarget) => string> = {
  names: (t) => `.names({ singular: '${humanizeSingular(t.tableName)}', plural: '${humanize(t.tableName)}' })`,
  list: (t) => `.list((r) => ({ columns: [${listColumns(t.fields).map((n) => `r.${n}`).join(', ')}] }))`,
}

const lines = (sections: readonly UiSection[], target: UiTarget) =>
  sections.map((s) => `  ${sectionText[s](target)}`)

export const renderUiFile = (target: UiTarget, sections: readonly UiSection[]) =>
  [
    `import { view } from '@protobase/schema'`,
    `import type { ${target.resource} } from './data'`,
    '',
    `export const ${viewName(target.resource)} = view<typeof ${target.resource}>('${target.resource}')`,
    ...lines(sections, target),
    '',
  ].join('\n')

// Appends the requested sections that the view chain does not have yet; existing calls stay as written.
export const addUiSections = (text: string, target: UiTarget, sections: readonly UiSection[]) => {
  const source = parseSource(text)
  const chain = source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === 'view')
    ?.getFirstAncestor((a) => Node.isVariableDeclaration(a))
    ?.getInitializer()
  if (!chain || !Node.isCallExpression(chain)) throw new Error('ui.ts has no view(...) export to extend')
  const missing = sections.filter((s) => methodCalls(chain, s).length === 0)
  if (missing.length === 0) return text
  chain.replaceWithText(`${chain.getText()}\n${lines(missing, target).join('\n')}`)
  return source.getFullText()
}
