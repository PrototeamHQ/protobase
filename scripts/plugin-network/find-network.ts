import ts from 'typescript'

/** Globals that send or reach something that sends, which a plugin must not use instead of its context's `fetch`. */
const forbidden = new Set(['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource', 'Bun', 'Deno', 'globalThis', 'global', 'self', 'window', 'process', 'require'])

/** One use of a way out besides the context's `fetch`: its file, line and what it is. */
export type NetworkUse = { file: string; line: number; what: string }

// Whether an identifier names a global: its symbol is declared only in declaration files or by `declare`, which
// TypeScript erases so the global is what runs, or nowhere, as `globalThis` is.
const isGlobal = (checker: ts.TypeChecker, node: ts.Identifier) => {
  const symbol = checker.getSymbolAtLocation(node)
  const declarations = symbol?.declarations ?? []
  return declarations.every((declaration) => declaration.getSourceFile().isDeclarationFile || (declaration.flags & ts.NodeFlags.Ambient) !== 0)
}

// A type, such as `typeof fetch`, is erased and sends nothing; a class's `extends` clause is a value and is still read.
const isErasedType = (node: ts.Node) => ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)

// An identifier that is a value read, not a property name after a dot, a key, or a name being declared.
const isRead = (node: ts.Identifier) => {
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) return false
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isBindingElement(parent) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) && parent.name === node) return false
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false
  return true
}

/**
 * Every way out of `files` besides the plugin context's `fetch`: a global that sends (`fetch`, `WebSocket`, ...), any
 * reach for the global object, `require`, and `import()` of anything, which the static import rules cannot see.
 */
export const findNetworkUses = (files: readonly string[]): NetworkUse[] => {
  const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true, skipLibCheck: true, types: ['node'], lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'] })
  const checker = program.getTypeChecker()
  const uses: NetworkUse[] = []
  for (const file of files) {
    const source = program.getSourceFile(file)
    if (!source) throw new Error(`${file} could not be read`)
    const at = (node: ts.Node, what: string) => uses.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, what })
    const visit = (node: ts.Node) => {
      if (isErasedType(node)) return
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) at(node, 'import()')
      if (ts.isIdentifier(node) && forbidden.has(node.text) && isRead(node) && isGlobal(checker, node)) at(node, node.text)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return uses
}
