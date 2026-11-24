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
  'CreateFunctionStmt',
  'CreateTrigStmt',
  'ViewStmt',
  'CommentStmt',
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
      return
    case 'AT_ColumnDefault':
      return cmd.def ? undefined : "drops a column's default"
    case 'AT_AddConstraint':
      return made ? undefined : `adds a constraint to a table there already, which rows written by older code may break`
    case 'AT_AddColumn': {
      if (made) return
      // A default of null is none.
      const constraints = (cmd.def.ColumnDef.constraints ?? []).filter((item: Node) => !(item.Constraint.contype === 'CONSTR_DEFAULT' && item.Constraint.raw_expr?.A_Const?.isnull)).map((item: Node) => item.Constraint.contype as string)
      const required = constraints.includes('CONSTR_NOTNULL') && !constraints.includes('CONSTR_DEFAULT')
      if (required) return `adds the required column ${cmd.def.ColumnDef.colname} without a default`
      const limiting = constraints.filter((contype: string) => !looseConstraints.has(contype) && contype !== 'CONSTR_NOTNULL')
      return limiting.length > 0 ? `adds the column ${cmd.def.ColumnDef.colname} with a constraint older code's rows may break` : undefined
    }
    default:
      return alterLabels[cmd.subtype] ?? `${cmd.subtype.replace(/^AT_/, '')}, which the lint cannot tell only adds`
  }
}

// A trigger by its table and name, as a drop and a create name it.
const droppedTriggers = (statement: Node) => (statement.objects ?? []).map((object: Node) => names(object?.List?.items))
const createdTrigger = (node: Node) => `${node.relation.schemaname ? `${node.relation.schemaname}.` : ''}${node.relation.relname}.${node.trigname}`

// A data-modifying statement of a `with` clause, such as a `delete ... returning` feeding an insert.
const modifyingCtes = (node: Node) =>
  [...(node.withClause?.ctes ?? []), ...(node.selectStmt?.SelectStmt?.withClause?.ctes ?? [])]
    .flatMap((cte: Node) => Object.keys(cte.CommonTableExpr?.ctequery ?? {}))
    .filter((kind: string) => kind !== 'SelectStmt')

// What a drop names, each object by its qualified name.
const droppedNames = (statement: Node) => (statement.objects ?? []).map((object: Node) => names(object?.List?.items ?? object?.ObjectWithArgs?.objname ?? (object?.String ? [object] : []))).join(', ')

/** One statement of the SQL: its kind and parse node. */
export type ParsedStatement = { kind: string; node: Node }

/**
 * What in `statements`, as Postgres's parser reads them in order, takes something from older code, one line each:
 * none when every statement only adds. A table the same statements make, without `if not exists`, takes any change;
 * a trigger dropped without `cascade` and made again on its table by a later statement is replaced.
 */
export const contractingStatements = (statements: readonly ParsedStatement[]) => {
  // `if not exists` may find the table there already, with rows.
  const made = new Set(statements.filter(({ kind, node }) => kind === 'CreateStmt' && !node.if_not_exists).map(({ node }) => relationKey(node.relation)))
  const triggersMade = statements.flatMap(({ kind, node }, index) => (kind === 'CreateTrigStmt' ? [{ key: createdTrigger(node), index }] : []))
  return statements.flatMap(({ kind, node }, index): string[] => {
    if (plainKinds.has(kind)) return []
    if (kind === 'InsertStmt' || kind === 'UpdateStmt') return modifyingCtes(node).map((cte: string) => kindLabels[cte] ?? `${cte.replace(/Stmt$/, '')} in a with clause, which the lint cannot tell only adds`)
    if (kind === 'AlterEnumStmt') return node.oldVal ? ['renames a value of an enum type'] : []
    if (kind === 'IndexStmt') return node.unique && !made.has(relationKey(node.relation)) ? ['adds a unique index to a table there already, which rows written by older code may break'] : []
    if (kind === 'AlterTableStmt' && node.objtype === 'OBJECT_TABLE') {
      return node.cmds.flatMap(({ AlterTableCmd: cmd }: Node) => {
        const finding = alterFinding(cmd, made.has(relationKey(node.relation)))
        return finding ? [finding] : []
      })
    }
    if (kind === 'DropStmt' && (node.removeType === 'OBJECT_INDEX' || node.removeType === 'OBJECT_POLICY')) return []
    if (kind === 'DropStmt' && node.behavior === 'DROP_CASCADE') return ['drops with cascade']
    // A trigger made again on its table is replaced; a view or function keeps what older code reads only through
    // `create or replace`, which Postgres refuses when its columns, arguments or result would change.
    if (kind === 'DropStmt' && node.removeType === 'OBJECT_TRIGGER') {
      return droppedTriggers(node)
        .filter((key: string) => !triggersMade.some((made) => made.key === key && made.index > index))
        .map((key: string) => `drops trigger ${key} without making it again`)
    }
    if (kind === 'DropStmt') {
      const what = node.removeType.replace(/^OBJECT_/, '').toLowerCase().replaceAll('_', ' ')
      const replace = node.removeType === 'OBJECT_VIEW' || node.removeType === 'OBJECT_FUNCTION' ? `, which \`create or replace\` keeps for older code` : ''
      return [`drops ${what} ${droppedNames(node)}${replace}`]
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
