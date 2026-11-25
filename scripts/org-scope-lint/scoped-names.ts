import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { resolveNames, type TableNames } from '../../packages/server/src/better-auth/names/resolve-names'
import type { ScopedName } from './sql-text'

/** What a config's `auth` says of the store's names: its schema and its `tables`. */
export type StoreNaming = { schema?: string; tables?: TableNames }

// The schema the store's tables are in when the config names none (`settingsStoreNames`).
const defaultSchema = 'auth'

/** The tables whose rows belong to one organization, as `naming` names them, every module on. */
export const scopedNamesOf = ({ schema = defaultSchema, tables }: StoreNaming): ScopedName[] =>
  Object.values(resolveNames({ schema, tables }).tables)
    .filter((table) => table.scope === 'organization')
    .map((table) => ({ schema, table: table.name }))

// A spread or a computed key could carry the names, so an object with one cannot be read.
const readable = (object: ts.ObjectLiteralExpression, where: string) => {
  const hidden = object.properties.some((property) => ts.isSpreadAssignment(property) || (property.name !== undefined && ts.isComputedPropertyName(property.name)))
  if (hidden) throw new Error(`${where} spreads an object or computes a key the organization scope lint cannot read: write its auth names as literals`)
  return object
}

// A property by its name, its value as written: a shorthand `{ tables }` gives the variable, which is no literal.
const propertyOf = (object: ts.ObjectLiteralExpression, name: string) => {
  const property = object.properties.find((one) => (ts.isPropertyAssignment(one) || ts.isShorthandPropertyAssignment(one)) && (ts.isIdentifier(one.name) || ts.isStringLiteral(one.name)) && one.name.text === name)
  if (property && ts.isShorthandPropertyAssignment(property)) return property.name
  return property && ts.isPropertyAssignment(property) ? property.initializer : undefined
}

// A literal of strings and objects of them, as `tables` and `schema` are written; anything else cannot be read.
const literalOf = (node: ts.Expression, where: string): unknown => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (!ts.isObjectLiteralExpression(node)) throw new Error(`${where} is not a literal the organization scope lint can read: write it as one`)
  return Object.fromEntries(
    node.properties.map((property) => {
      if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) throw new Error(`${where} is not a literal the organization scope lint can read: write it as one`)
      return [property.name.text, literalOf(property.initializer, `${where}.${property.name.text}`)]
    }),
  )
}

// The object a config file exports: `export default defineConfig({ ... })` or `export default { ... }`.
const exportedConfig = (source: ts.SourceFile) => {
  const exported = source.statements.find(ts.isExportAssignment)?.expression
  const object = exported && ts.isCallExpression(exported) ? exported.arguments[0] : exported
  return object && ts.isObjectLiteralExpression(object) ? object : undefined
}

/** The store's naming a `protobase.config.ts` gives, read from its source; a config the lint cannot read fails. */
export const configNaming = (file: string): StoreNaming => {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const config = exportedConfig(source)
  if (!config) throw new Error(`${file}: its default export is not a config object the organization scope lint can read`)
  const auth = propertyOf(readable(config, file), 'auth')
  if (!auth) return {}
  if (!ts.isObjectLiteralExpression(auth)) throw new Error(`${file}: auth is not a literal the organization scope lint can read: write it as one`)
  const schema = propertyOf(readable(auth, `${file}: auth`), 'schema')
  const tables = propertyOf(auth, 'tables')
  const schemaName = schema && literalOf(schema, `${file}: auth.schema`)
  if (schemaName !== undefined && typeof schemaName !== 'string') throw new Error(`${file}: auth.schema is not a string the organization scope lint can read`)
  return {
    ...(schemaName !== undefined && { schema: schemaName }),
    ...(tables && { tables: literalOf(tables, `${file}: auth.tables`) as TableNames }),
  }
}

/** The scoped names under the default naming and every config's, each once. */
export const scopedNames = (configs: readonly string[]) => {
  const all = [{}, ...configs.map(configNaming)].flatMap(scopedNamesOf)
  return all.filter((name, i) => all.findIndex((other) => other.schema === name.schema && other.table === name.table) === i)
}
