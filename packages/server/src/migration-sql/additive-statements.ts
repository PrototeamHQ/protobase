// Whether hand-written SQL only adds, read from Postgres's own parser: older code still runs on the database once it is
// applied. An allow-list: a statement of a kind not listed here counts as taking something from older code, as does
// one the parser cannot read, such as a `do` block whose statements it cannot see.

type Node = Record<string, any>
type RangeVar = { schemaname?: string; relname: string }

const relationKey = ({ schemaname, relname }: RangeVar) => `${schemaname ?? ''}.${relname}`

// A trigger, function or view by the name a drop and a create give it.
const names = (items: Node[] | undefined) => (items ?? []).map((item) => item.String?.sval as string).join('.')

/** Statements that only add whatever they act on. */
const plainKinds = new Set([
  'CreateSchemaStmt',
  'CreateStmt',
  'CreateExtensionStmt',
  'CreateSeqStmt',
  'CreateEnumStmt',
  'AlterEnumStmt',
  'CreateFunctionStmt',
  'CreateTrigStmt',
  'ViewStmt',
  'CommentStmt',
  'InsertStmt',
  'UpdateStmt',
  'VariableSetStmt',
  // Access narrowed or widened: narrowing is always allowed.
  'GrantStmt',
  'CreatePolicyStmt',
])

// The constraints a new column may carry on a table there already without limiting what older code writes.
const looseConstraints = new Set(['CONSTR_NULL', 'CONSTR_DEFAULT', 'CONSTR_GENERATED', 'CONSTR_IDENTITY'])

// What the commonest changes that take from older code do, by their parse node.
const alterLabels: Record<string, string> = { AT_DropColumn: 'drops a column', AT_AlterColumnType: "changes a column's type", AT_SetNotNull: 'makes a column not null', AT_DropConstraint: 'drops a constraint' }
const kindLabels: Record<string, string> = { RenameStmt: 'renames a table, column or other object', AlterObjectSchemaStmt: 'moves an object to another schema', DeleteStmt: 'deletes rows', TruncateStmt: 'empties a table' }

const alterFinding = (cmd: Node, made: boolean): string | undefined => {
  switch (cmd.subtype) {
    case 'AT_DropNotNull':
    case 'AT_ColumnDefault':
      return
    case 'AT_AddConstraint':
      return made ? undefined : `adds a constraint to a table there already, which rows written by older code may break`
    case 'AT_AddColumn': {
      if (made) return
      const constraints = (cmd.def.ColumnDef.constraints ?? []).map((item: Node) => item.Constraint.contype as string)
      const required = constraints.includes('CONSTR_NOTNULL') && !constraints.includes('CONSTR_DEFAULT')
      if (required) return `adds the required column ${cmd.def.ColumnDef.colname} without a default`
      const limiting = constraints.filter((contype: string) => !looseConstraints.has(contype) && contype !== 'CONSTR_NOTNULL')
      return limiting.length > 0 ? `adds the column ${cmd.def.ColumnDef.colname} with a constraint older code's rows may break` : undefined
    }
    default:
      return alterLabels[cmd.subtype] ?? `${cmd.subtype.replace(/^AT_/, '')}, which the lint cannot tell only adds`
  }
}

// What is dropped: the key a later create of the same object goes by.
const droppedKey = (statement: Node) => {
  const object = statement.objects?.[0]
  if (statement.removeType === 'OBJECT_FUNCTION') return names(object?.ObjectWithArgs?.objname)
  return names(object?.List?.items)
}

const createdKey = (kind: string, node: Node) => {
  if (kind === 'CreateFunctionStmt') return { type: 'OBJECT_FUNCTION', key: names(node.funcname) }
  if (kind === 'CreateTrigStmt') return { type: 'OBJECT_TRIGGER', key: `${node.relation.schemaname ? `${node.relation.schemaname}.` : ''}${node.relation.relname}.${node.trigname}` }
  if (kind === 'ViewStmt') return { type: 'OBJECT_VIEW', key: `${node.view.schemaname ? `${node.view.schemaname}.` : ''}${node.view.relname}` }
  return
}

// What holds no rows, so a drop is no loss when the same file makes it again.
const replaceable = new Set(['OBJECT_FUNCTION', 'OBJECT_TRIGGER', 'OBJECT_VIEW'])

/** One statement of the SQL: its kind and parse node. */
export type ParsedStatement = { kind: string; node: Node }

/**
 * What in `statements`, as Postgres's parser reads them in order, takes something from older code, one line each:
 * none when every statement only adds. A table the same statements make takes any change; a function, trigger or view
 * dropped without `cascade` and made again by a later statement is replaced.
 */
export const contractingStatements = (statements: readonly ParsedStatement[]) => {
  const made = new Set(statements.filter(({ kind }) => kind === 'CreateStmt').map(({ node }) => relationKey(node.relation)))
  const created = statements.flatMap(({ kind, node }, index) => {
    const found = createdKey(kind, node)
    return found ? [{ ...found, index }] : []
  })
  return statements.flatMap(({ kind, node }, index): string[] => {
    if (plainKinds.has(kind)) return []
    if (kind === 'IndexStmt') return node.unique && !made.has(relationKey(node.relation)) ? ['adds a unique index to a table there already, which rows written by older code may break'] : []
    if (kind === 'AlterTableStmt' && node.objtype === 'OBJECT_TABLE') {
      return node.cmds.flatMap(({ AlterTableCmd: cmd }: Node) => {
        const finding = alterFinding(cmd, made.has(relationKey(node.relation)))
        return finding ? [finding] : []
      })
    }
    if (kind === 'DropStmt' && (node.removeType === 'OBJECT_INDEX' || node.removeType === 'OBJECT_POLICY')) return []
    if (kind === 'DropStmt') {
      const key = droppedKey(node)
      const what = node.removeType.replace(/^OBJECT_/, '').toLowerCase().replaceAll('_', ' ')
      if (node.behavior === 'DROP_CASCADE') return [`drops ${what} ${key} with cascade`]
      const remade = replaceable.has(node.removeType) && created.some((create) => create.type === node.removeType && create.key === key && create.index > index)
      return remade ? [] : [`drops ${what} ${key}${replaceable.has(node.removeType) ? ' without making it again' : ''}`]
    }
    return [kindLabels[kind] ?? `${kind.replace(/Stmt$/, '')}, which the lint cannot tell only adds`]
  })
}

/** What in `sql` takes something from older code, read with libpg-query, Postgres's parser; a parse error is one line. */
export const contractingSql = async (sql: string) => {
  const { parse, SqlError } = await import('libpg-query')
  let parsed: Awaited<ReturnType<typeof parse>>
  try {
    parsed = await parse(sql)
  } catch (error) {
    if (!(error instanceof SqlError)) throw error
    return ['SQL the parser cannot read']
  }
  return contractingStatements(
    (parsed.stmts ?? []).map(({ stmt }) => {
      const [kind, node] = Object.entries(stmt ?? {})[0]!
      return { kind, node: node as Node }
    }),
  )
}
