/**
 * A formula as {@link parseFormula} reads it: numbers, the record's fields, `+ - * /`, a leading minus, parentheses,
 * `coalesce(a, b, ...)` and `round(x)` or `round(x, digits)`.
 */
export type FormulaNode =
  | { kind: 'number'; value: string }
  | { kind: 'field'; name: string }
  | { kind: 'negate'; operand: FormulaNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode }
  | { kind: 'coalesce'; args: FormulaNode[] }
  | { kind: 'round'; value: FormulaNode; digits?: number }

type Token = { kind: 'number' | 'name' | 'symbol'; text: string; at: number }

const tokenPattern = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/(),]))/y

const tokenize = (source: string) => {
  const tokens: Token[] = []
  tokenPattern.lastIndex = 0
  while (tokenPattern.lastIndex < source.length) {
    const at = tokenPattern.lastIndex
    const match = tokenPattern.exec(source)
    if (!match) {
      const rest = source.slice(at)
      if (rest.trim() === '') break
      const skipped = rest.length - rest.trimStart().length
      throw new Error(`Formula "${source}": unexpected "${rest[skipped]}" at ${at + skipped + 1}`)
    }
    const [whole, number, name, symbol] = match
    const text = (number ?? name ?? symbol)!
    tokens.push({ kind: number !== undefined ? 'number' : name !== undefined ? 'name' : 'symbol', text, at: at + whole.length - text.length })
  }
  return tokens
}

/** Reads a formula, or throws naming what it cannot read. */
export const parseFormula = (source: string): FormulaNode => {
  const tokens = tokenize(source)
  let position = 0
  const fail = (what: string): never => {
    const token = tokens[position]
    throw new Error(`Formula "${source}": ${what}${token ? ` at ${token.at + 1}, found "${token.text}"` : ' at the end'}`)
  }
  const peek = (text: string) => tokens[position]?.kind === 'symbol' && tokens[position]!.text === text
  const expect = (text: string) => {
    if (!peek(text)) fail(`expected "${text}"`)
    position += 1
  }
  const args = () => {
    expect('(')
    const list = [sum()]
    while (peek(',')) {
      position += 1
      list.push(sum())
    }
    expect(')')
    return list
  }
  const call = (name: string): FormulaNode => {
    if (name === 'coalesce') {
      const list = args()
      if (list.length < 2) fail('coalesce() takes at least two values')
      return { kind: 'coalesce', args: list }
    }
    const list = args()
    const [value, digits] = list
    if (list.length > 2) fail('round() takes a value and at most a number of digits')
    if (digits === undefined) return { kind: 'round', value: value! }
    if (digits.kind !== 'number' || digits.value.includes('.')) fail("round()'s digits must be a whole number")
    return { kind: 'round', value: value!, digits: Number((digits as { value: string }).value) }
  }
  const operand = (): FormulaNode => {
    const token = tokens[position]
    if (!token) return fail('expected a number, a field or "("')
    if (token.kind === 'number') {
      position += 1
      return { kind: 'number', value: token.text }
    }
    if (token.kind === 'name') {
      position += 1
      if (!peek('(')) return { kind: 'field', name: token.text }
      if (token.text !== 'coalesce' && token.text !== 'round') {
        position -= 1
        return fail(`unknown function "${token.text}", only coalesce() and round()`)
      }
      return call(token.text)
    }
    if (token.text === '-') {
      position += 1
      return { kind: 'negate', operand: operand() }
    }
    if (token.text === '(') {
      position += 1
      const inner = sum()
      expect(')')
      return inner
    }
    return fail('expected a number, a field or "("')
  }
  const product = (): FormulaNode => {
    let node = operand()
    while (peek('*') || peek('/')) {
      const op = tokens[position]!.text as '*' | '/'
      position += 1
      node = { kind: 'binary', op, left: node, right: operand() }
    }
    return node
  }
  const sum = (): FormulaNode => {
    let node = product()
    while (peek('+') || peek('-')) {
      const op = tokens[position]!.text as '+' | '-'
      position += 1
      node = { kind: 'binary', op, left: node, right: product() }
    }
    return node
  }
  const node = sum()
  if (position < tokens.length) fail('expected an operator')
  return node
}

/** The fields a formula reads, each once, in the order it names them. */
export const formulaFields = (node: FormulaNode): string[] => {
  const names = (part: FormulaNode): string[] => {
    if (part.kind === 'field') return [part.name]
    if (part.kind === 'number') return []
    if (part.kind === 'negate') return names(part.operand)
    if (part.kind === 'binary') return [...names(part.left), ...names(part.right)]
    if (part.kind === 'coalesce') return part.args.flatMap(names)
    return names(part.value)
  }
  return [...new Set(names(node))]
}

/** Whether a formula can be empty: when a field it needs is, unless `coalesce()` has a value that is not. */
export const formulaNullable = (node: FormulaNode, nullable: (field: string) => boolean): boolean => {
  if (node.kind === 'field') return nullable(node.name)
  if (node.kind === 'number') return false
  if (node.kind === 'negate') return formulaNullable(node.operand, nullable)
  if (node.kind === 'binary') return formulaNullable(node.left, nullable) || formulaNullable(node.right, nullable)
  if (node.kind === 'coalesce') return node.args.every((arg) => formulaNullable(arg, nullable))
  return formulaNullable(node.value, nullable)
}
