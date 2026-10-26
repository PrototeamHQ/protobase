import { Node, SyntaxKind } from 'ts-morph'
import { humanize, humanizeSingular } from '../infer/names'
import { methodCalls } from './existing-config'
import { parseSource } from './project'

export type UiSection = 'names' | 'list'

export type UiField = {
  name: string
  type: string
  // Has `.sortable()`, so the list may sort by it.
  sortable: boolean
  role: 'key' | 'tenant' | 'softDelete' | 'plain'
}

export type UiTarget = {
  // Resource name, e.g. "order_lines" for `sales.order_lines`.
  resource: string
  // The variable data.ts exports the resource as, e.g. "orderLines".
  identifier: string
  tableName: string
  fields: UiField[]
}

const auditField = /^(created|updated)(At|On|_at|_on)$/
const createdField = /^(created|inserted)(At|On|_at|_on)$/
const longText = /^(notes?|description|body|comment|comments)$/
const listSize = 5
const secretWords = new Set(['password', 'passwd', 'hash', 'token', 'secret', 'salt', 'otp'])
const secretPairs = ['private key', 'api key']

// Credentials, by the words of the name (`password_hash`, `accessToken`, `private_key`), which no list shows.
export const isSecretLike = (name: string) => {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const joined = words.join(' ')
  return words.some((word) => secretWords.has(word)) || secretPairs.some((pair) => joined.includes(pair))
}

const relationsShown = 2

/**
 * The first useful fields: the key, unless it is a uuid nobody reads, then the records a record points at, such as an
 * order line's order, then plain scalars, never a secret-like one. Without any of them, the key after all.
 */
export const listColumns = (fields: UiField[]) => {
  const keys = fields.filter((f) => f.role === 'key' && f.type !== 'uuid')
  const plain = fields.filter((f) => f.role === 'plain' && f.type !== 'json' && !auditField.test(f.name) && !isSecretLike(f.name))
  const relations = plain.filter((f) => f.type === 'relation').slice(0, relationsShown)
  const scalars = plain.filter((f) => f.type !== 'relation' && !longText.test(f.name))
  const picked = [...keys, ...relations, ...scalars].slice(0, listSize)
  return (picked.length > 0 ? picked : fields.filter((f) => f.role === 'key')).map((f) => f.name)
}

/**
 * The newest records first, by the sortable date the records were created on, else by another sortable date. Without
 * one the list keeps the API's order, by key.
 */
export const listSort = (fields: UiField[]) => {
  const dates = fields.filter((f) => f.sortable && (f.type === 'timestamp' || f.type === 'date'))
  return (dates.find((f) => createdField.test(f.name)) ?? dates[0])?.name
}

export const viewName = (identifier: string) => `${identifier}View`

const sectionText: Record<UiSection, (target: UiTarget) => string> = {
  names: (t) => `.names({ singular: '${humanizeSingular(t.tableName)}', plural: '${humanize(t.tableName)}' })`,
  list: (t) => {
    const sort = listSort(t.fields)
    return `.list((r) => ({ columns: [${listColumns(t.fields).map((n) => `r.${n}`).join(', ')}]${sort ? `, sort: [[r.${sort}, 'desc']]` : ''} }))`
  },
}

const lines = (sections: readonly UiSection[], target: UiTarget) =>
  sections.map((s) => `  ${sectionText[s](target)}`)

export const renderUiFile = (target: UiTarget, sections: readonly UiSection[]) =>
  [
    `import { view } from '@protobase/schema'`,
    `import type { ${target.identifier} } from './data'`,
    '',
    `export const ${viewName(target.identifier)} = view<typeof ${target.identifier}>('${target.resource}')`,
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
