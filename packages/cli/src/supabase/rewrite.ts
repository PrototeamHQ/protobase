import { splitDump } from './statements'
import { tokenize, wordsAt, type Token } from './tokens'

/**
 * Supabase's own roles, which a Protobase database does not have: the dashboard's, the platform services', the API
 * gateway's login role, and `postgres`, the role the dump was taken as. The API roles `anon`, `authenticated` and
 * `service_role` are not among them; the app's grants and policies name those.
 */
export const isSupabaseRole = (role: string) => role === 'dashboard_user' || role === 'authenticator' || role === 'postgres' || role.startsWith('supabase_')

/**
 * What the project's database lacks that the dump may use, so its statements are left out: the schemas of functions
 * no trigger may call there (`supabase_functions` without the webhooks shim, and timescaledb's own, since a hypertable
 * restores as a plain table), and the languages whose extension it cannot create (plv8), whose functions it leaves
 * out with every statement naming them.
 */
export type Missing = { triggerSchemas: string[]; languages: string[] }

type Verdict = { keep: string } | { drop: string }

const keep = (text: string): Verdict => ({ keep: text })

/** The grantee list of a GRANT or REVOKE: the role names after its last top-level TO (or FROM), up to its options. */
const grantees = (statement: string, tokens: Token[], from: number, keyword: 'to' | 'from') => {
  const at = tokens.findLastIndex((token, i) => i >= from && token.depth === 0 && wordsAt(statement, tokens, i, [keyword]))
  if (at === -1) return undefined
  const end = tokens.findIndex((token, i) => i > at && (token.word === 'with' || token.word === 'granted' || statement[token.start] === ';'))
  const names = tokens.slice(at + 1, end === -1 ? undefined : end).filter((token) => statement[token.start] !== ',')
  return { names, start: names[0]?.start ?? 0, end: names.at(-1)?.end ?? 0 }
}

/**
 * A GRANT or REVOKE from `from` on, without the Supabase roles among its grantees: dropped when it names only those,
 * since such a statement fails where the roles do not exist.
 */
const withoutSupabaseGrantees = (statement: string, tokens: Token[], from: number): Verdict => {
  const list = grantees(statement, tokens, from, wordsAt(statement, tokens, from, ['grant']) ? 'to' : 'from')
  if (!list) return keep(statement)
  const kept = list.names.filter((name) => !isSupabaseRole(name.word ?? ''))
  if (kept.length === list.names.length) return keep(statement)
  if (kept.length === 0) return { drop: "it names only Supabase's own roles" }
  const names = kept.map((name) => statement.slice(name.start, name.end)).join(', ')
  return keep(statement.slice(0, list.start) + names + statement.slice(list.end))
}

const nextGrant = (statement: string, tokens: Token[]) => tokens.findIndex((_, i) => wordsAt(statement, tokens, i, ['grant']) || wordsAt(statement, tokens, i, ['revoke']))

/** `ALTER DEFAULT PRIVILEGES` for the importing role itself: without `FOR ROLE …`, which names a Supabase role. */
const defaultPrivileges = (statement: string, tokens: Token[]): Verdict => {
  if (!wordsAt(statement, tokens, 3, ['for'])) return withoutSupabaseGrantees(statement, tokens, nextGrant(statement, tokens))
  const next = tokens.findIndex((_, i) => i > 4 && (wordsAt(statement, tokens, i, ['in']) || wordsAt(statement, tokens, i, ['grant']) || wordsAt(statement, tokens, i, ['revoke'])))
  const rewritten = statement.slice(0, tokens[3]!.start) + statement.slice(tokens[next]!.start)
  return defaultPrivileges(rewritten, tokenize(rewritten))
}

/** A routine's qualified name at token `at` (`schema.name`), and its name with the signature after it, as the dump writes both. */
const routineAt = (statement: string, tokens: Token[], at: number) => {
  if (statement[tokens[at + 1]?.start ?? 0] !== '.' || statement[tokens[at + 3]?.start ?? 0] !== '(') return undefined
  const close = tokens.findIndex((token, i) => i > at + 3 && token.depth === tokens[at + 3]!.depth && statement[token.start] === ')')
  return { name: `${tokens[at]!.word}.${tokens[at + 2]!.word}`, signature: statement.slice(tokens[at]!.start, tokens[close]!.end) }
}

/** The routines a rewrite left out, by name for the triggers calling them and by signature for statements naming them. */
type LeftOutRoutines = { names: Set<string>; signatures: Set<string> }

/** A CREATE FUNCTION or PROCEDURE in a missing language, left out, or a statement naming one left out before. */
const routineVerdict = (statement: string, tokens: Token[], missing: Missing, routines: LeftOutRoutines): Verdict | undefined => {
  const at = (...words: string[]) => wordsAt(statement, tokens, 0, words)
  const create = at('create', 'function') || at('create', 'procedure') ? 2 : at('create', 'or', 'replace', 'function') || at('create', 'or', 'replace', 'procedure') ? 4 : -1
  if (create !== -1) {
    const language = tokens.findIndex((token, i) => i > create && token.depth === 0 && wordsAt(statement, tokens, i, ['language']))
    const name = tokens[language + 1]?.word
    const routine = routineAt(statement, tokens, create)
    if (!name || !routine || !missing.languages.includes(name)) return undefined
    routines.names.add(routine.name)
    routines.signatures.add(routine.signature)
    return { drop: `it is written in ${name}, which the project's database does not have; the report lists it for conversion` }
  }
  if (routines.signatures.size === 0) return undefined
  const named = tokens.some((token, i) => (token.word === 'function' || token.word === 'procedure') && routines.signatures.has(routineAt(statement, tokens, i + 1)?.signature ?? ''))
  return named ? { drop: 'it names a function left out above' } : undefined
}

/** A statement as it should restore on a Protobase database, or why it is left out. */
const rewriteStatement = (statement: string, missing: Missing, routines: LeftOutRoutines): Verdict => {
  const tokens = tokenize(statement)
  const at = (...words: string[]) => wordsAt(statement, tokens, 0, words)
  const routine = routineVerdict(statement, tokens, missing, routines)
  if (routine) return routine
  if (at('grant') || at('revoke')) return withoutSupabaseGrantees(statement, tokens, 0)
  if (at('alter', 'default', 'privileges')) return defaultPrivileges(statement, tokens)
  // The public schema belongs to the database's owner, which already made it.
  if (at('create', 'schema', 'public') || at('comment', 'on', 'schema', 'public') || at('alter', 'schema', 'public')) return { drop: 'the public schema already exists and is not the import\'s to change' }
  // Realtime's publication is Supabase's; the report lists its tables.
  if (at('alter', 'publication') || at('create', 'publication')) return { drop: "publications are Supabase Realtime's; the report lists their tables" }
  if (at('create', 'trigger') || at('create', 'constraint', 'trigger') || at('create', 'or', 'replace', 'trigger')) {
    const call = tokens.findIndex((_, i) => wordsAt(statement, tokens, i, ['execute', 'function']) || wordsAt(statement, tokens, i, ['execute', 'procedure']))
    const called = call === -1 ? undefined : routineAt(statement, tokens, call + 2)
    if (called && missing.triggerSchemas.includes(called.name.split('.')[0]!)) return { drop: `it calls ${called.name}, which the import does not carry over; the report lists it` }
    if (called && routines.names.has(called.name)) return { drop: 'it calls a function left out above' }
  }
  return keep(statement)
}

/** A left-out statement as comment lines, with why. */
const leftOut = (statement: string, reason: string) => `-- Left out by protobase import supabase: ${reason}.\n${statement.replace(/^/gm, '-- ')}`

/**
 * A `pg_dump --schema-only` of a Supabase database, rewritten to restore without errors as a role that is not a
 * superuser and has none of Supabase's own roles, on a database lacking what `missing` names, and how many statements
 * it leaves out. Statements are parsed, so a rule never touches a function body or a string.
 */
export const rewriteSchemaDump = (dump: string, missing: Missing) => {
  let leftOutCount = 0
  const routines: LeftOutRoutines = { names: new Set(), signatures: new Set() }
  const sql = splitDump(dump)
    .map((piece) => {
      // psql's meta-commands (`\restrict`, `\unrestrict`) are not SQL; the project's migrations run through a driver.
      if (piece.kind === 'meta') return ''
      if (piece.kind === 'gap') return piece.text
      const verdict = rewriteStatement(piece.text, missing, routines)
      if ('keep' in verdict) return verdict.keep
      leftOutCount++
      return leftOut(piece.text, verdict.drop)
    })
    .join('')
  return { sql, leftOut: leftOutCount }
}
