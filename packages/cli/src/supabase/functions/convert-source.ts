import { ts } from 'ts-morph'
import { resolveImport, type ImportMap } from './import-map'
import { bareImport, type ImportedPackage } from './specifier'

export type SourceOptions = {
  /** The file's path, as the notes name it. */
  file: string
  /** Whether the file is a function's `index.ts`, whose `Deno.serve` becomes its default export. */
  entry: boolean
  /** Whether the function is open to anyone (`verify_jwt = false`): its default export becomes `defineFunction({ public: true, supabase: true }, ...)`. */
  public: boolean
  importMap: ImportMap
}

export type ConvertedSource = {
  code: string
  packages: ImportedPackage[]
  /** What the conversion could not carry over, each `<file>:<line>: <what>`, for a person or the AI skill. */
  left: string[]
}

type Edit = { start: number; end: number; text: string }

// std's `serve`, which came before `Deno.serve`.
const stdServer = /^https:\/\/deno\.land\/std(@[^/]+)?\/http\/server\.ts$/

// The types of `EdgeRuntime` and Supabase's other globals, which Node and Bun do not need.
const isEdgeRuntimeTypes = (specifier: string) => specifier.endsWith('/edge-runtime.d.ts')

// Globals of Deno and Supabase's runtime that Node and Bun lack.
const runtimeGlobals = new Set(['Deno', 'EdgeRuntime', 'Supabase'])

const isAccess = (node: ts.Node, object: string, ...names: string[]): boolean => {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== names.at(-1)) return false
  if (names.length === 1) return ts.isIdentifier(node.expression) && node.expression.text === object
  return isAccess(node.expression, object, ...names.slice(0, -1))
}

// `Deno.serve(handler)` or `Deno.serve(options, handler)`: the handler, which becomes the default export's `fetch`.
const serveHandler = (call: ts.CallExpression) => {
  const [first, second] = call.arguments
  if (call.arguments.length === 1 && !ts.isObjectLiteralExpression(first!)) return first
  if (call.arguments.length === 2) return second
  return undefined
}

const applyEdits = (code: string, edits: Edit[]) => {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end)
  let out = ''
  let at = 0
  for (const edit of sorted) {
    out += code.slice(at, edit.start) + edit.text
    at = Math.max(at, edit.end)
  }
  return out + code.slice(at)
}

/**
 * Converts one file of a Supabase Edge Function for Protobase, by its syntax tree: `npm:`, `jsr:` and esm.sh imports
 * become bare imports of the packages it reports, `Deno.env.get(x)` becomes `process.env[x]`, and
 * `EdgeRuntime.waitUntil` Protobase's `waitUntil`. In a function's entry, `Deno.serve(handler)` or std's
 * `serve(handler)` becomes `export default defineFunction({ supabase: true }, { fetch: handler })`, and an existing
 * default export is wrapped the same way, so the function answers at `/api/sb/functions/v1/<name>` too. Anything else
 * of Deno's or Supabase's runtime, and imports of no npm package, stay as they are and are listed in `left`.
 */
export const convertSource = (code: string, options: SourceOptions): ConvertedSource => {
  const source = ts.createSourceFile(options.file, code, ts.ScriptTarget.Latest, true)
  const edits: Edit[] = []
  const packages: ImportedPackage[] = []
  const left: string[] = []
  const handled = new Set<ts.Node>()
  const serveNames = new Set<string>()
  const imports = new Set<string>()
  const note = (node: ts.Node, what: string) => left.push(`${options.file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${what}`)
  const remove = (statement: ts.Statement) => {
    const end = code[statement.end] === '\n' ? statement.end + 1 : statement.end
    edits.push({ start: statement.getStart(source), end, text: '' })
  }
  const defaultExport = source.statements.find((statement) => ts.isExportAssignment(statement) && !statement.isExportEquals) as ts.ExportAssignment | undefined
  let served = false
  const opts = options.public ? '{ public: true, supabase: true }' : '{ supabase: true }'

  const rewriteSpecifier = (literal: ts.StringLiteral, statement?: ts.ImportDeclaration) => {
    const specifier = resolveImport(literal.text, options.importMap)
    if (statement && !statement.importClause && isEdgeRuntimeTypes(specifier)) return remove(statement)
    const named = statement?.importClause?.namedBindings
    if (options.entry && stdServer.test(specifier) && named && ts.isNamedImports(named) && named.elements.every((element) => (element.propertyName ?? element.name).text === 'serve')) {
      named.elements.forEach((element) => serveNames.add(element.name.text))
      return remove(statement!)
    }
    const bare = bareImport(specifier)
    if (bare) {
      packages.push(bare.package)
      if (bare.specifier !== literal.text) edits.push({ start: literal.getStart(source) + 1, end: literal.end - 1, text: bare.specifier })
      return
    }
    if (specifier !== literal.text && !/^(https?:|jsr:|npm:)/.test(specifier)) {
      edits.push({ start: literal.getStart(source) + 1, end: literal.end - 1, text: specifier })
      return
    }
    if (/^(https?:|jsr:|npm:)/.test(specifier)) note(literal, `import of ${specifier}, which is no npm package: import one that does the same`)
  }

  const convertServe = (call: ts.CallExpression) => {
    handled.add(call.expression)
    const statement = call.parent
    const handler = serveHandler(call)
    if (!options.entry || !ts.isExpressionStatement(statement) || statement.parent !== source || !handler || defaultExport || served) {
      return note(call, `${call.expression.getText(source)}(...), which Protobase does not run: default-export defineFunction(${opts}, { fetch: handler })`)
    }
    served = true
    imports.add('defineFunction')
    edits.push({ start: statement.getStart(source), end: handler.getStart(source), text: `export default defineFunction(${opts}, { fetch: ` })
    edits.push({ start: handler.end, end: statement.end, text: ' })' })
  }

  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      rewriteSpecifier(node.moduleSpecifier, ts.isImportDeclaration(node) ? node : undefined)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      rewriteSpecifier(node.arguments[0])
    } else if (ts.isCallExpression(node) && (isAccess(node.expression, 'Deno', 'serve') || (ts.isIdentifier(node.expression) && serveNames.has(node.expression.text)))) {
      convertServe(node)
    } else if (ts.isCallExpression(node) && isAccess(node.expression, 'Deno', 'env', 'get') && node.arguments.length === 1) {
      handled.add(node.expression)
      edits.push({ start: node.getStart(source), end: node.arguments[0]!.getStart(source), text: 'process.env[' })
      edits.push({ start: node.arguments[0]!.end, end: node.end, text: ']' })
    } else if (ts.isCallExpression(node) && isAccess(node.expression, 'EdgeRuntime', 'waitUntil')) {
      handled.add(node.expression)
      imports.add('waitUntil')
      edits.push({ start: node.expression.getStart(source), end: node.expression.end, text: 'waitUntil' })
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && runtimeGlobals.has(node.expression.text)) {
      let top: ts.Node = node
      while (ts.isPropertyAccessExpression(top.parent) && top.parent.expression === top) top = top.parent
      if (!handled.has(top)) note(node, `${top.getText(source)}, of ${node.expression.text === 'Deno' ? 'Deno' : "Supabase's runtime"}: rewrite it for Node or Bun`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  if (options.entry && !served && !defaultExport) note(source.statements[0] ?? source, `no Deno.serve or default export to serve: default-export defineFunction(${opts}, { fetch: handler })`)
  if (options.entry && defaultExport) {
    imports.add('defineFunction')
    edits.push({ start: defaultExport.expression.getStart(source), end: defaultExport.expression.getStart(source), text: `defineFunction(${opts}, ` })
    edits.push({ start: defaultExport.expression.end, end: defaultExport.expression.end, text: ')' })
  }
  if (imports.size > 0) {
    const first = source.statements[0]
    const at = first ? first.getStart(source) : 0
    edits.push({ start: at, end: at, text: `import { ${[...imports].sort().join(', ')} } from '@protobase/server'\n` })
  }
  return { code: applyEdits(code, edits), packages, left }
}
