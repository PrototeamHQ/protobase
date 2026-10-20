import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { RowSource } from './read-rows'
import { restError } from './rest-error'

/** A function of the `public` schema as the catalog describes it. */
export type FunctionInfo = {
  name: string
  /** Its input arguments in order, with their types as Postgres prints them; an unnamed one has an empty name. */
  inputs: { name: string; type: string }[]
  /** How many of the last inputs have defaults. */
  defaults: number
  /** `void`, a scalar, a row of a table or `returns table (...)`, each one or a set. */
  returns: 'void' | 'scalar' | 'row'
  set: boolean
}

type Row = { name: string; arg_names: string[] | null; arg_modes: string[] | null; input_types: string[]; defaults: number; returns: string; return_kind: string; set: boolean }

/** The functions of the `public` schema called `name`, every overload. */
export const findFunctions = async (db: Db, name: string): Promise<FunctionInfo[]> => {
  const { rows } = await sql<Row>`
    select p.proname as name, p.proargnames as arg_names, p.proargmodes::text[] as arg_modes, p.pronargdefaults::int as defaults,
      array(select format_type(t.oid, null) from unnest(p.proargtypes::oid[]) with ordinality as t(oid, i) order by t.i) as input_types,
      format_type(p.prorettype, null) as returns, r.typtype as return_kind, p.proretset as set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type r on r.oid = p.prorettype
    where n.nspname = 'public' and p.proname = ${name} and p.prokind = 'f'
    order by p.oid
  `.execute(db)
  return rows.map((row) => {
    // Without modes every argument is an input; with them, `i`, `b` and `v` are, `o` and `t` are outputs.
    const names = (row.arg_names ?? []).filter((_, i) => !row.arg_modes || ['i', 'b', 'v'].includes(row.arg_modes[i]!))
    const returns = row.returns === 'void' ? 'void' : row.return_kind === 'c' || row.returns === 'record' ? 'row' : 'scalar'
    return { name: row.name, inputs: row.input_types.map((type, i) => ({ name: names[i] ?? '', type })), defaults: row.defaults, returns, set: row.set }
  })
}

/** How a call passes its arguments: by name from a JSON object, or the whole body as the one unnamed json or jsonb argument. */
export type Call = { info: FunctionInfo; by: 'name'; args: string[] } | { info: FunctionInfo; by: 'body' }

const takesBody = (info: FunctionInfo) => info.inputs.length === 1 && info.inputs[0]!.name === '' && ['json', 'jsonb'].includes(info.inputs[0]!.type)

const listed = (names: readonly string[]) => [...names].sort().join(', ')

/**
 * The overload a call with these argument names reaches: one whose inputs include every name and whose inputs without
 * a default are all given; else one that takes the body as its single unnamed json or jsonb argument. None is 404
 * (PGRST202) and more than one 300 (PGRST203), worded as PostgREST words them.
 */
export const chooseFunction = (name: string, candidates: readonly FunctionInfo[], given: readonly string[]): Call => {
  const byName = candidates.filter((info) => {
    const inputs = info.inputs.map((input) => input.name)
    const required = inputs.slice(0, inputs.length - info.defaults)
    return given.every((arg) => inputs.includes(arg)) && required.every((arg) => given.includes(arg))
  })
  const matches: Call[] = byName.length > 0 ? byName.map((info) => ({ info, by: 'name', args: info.inputs.map((input) => input.name).filter((arg) => given.includes(arg)) })) : candidates.filter(takesBody).map((info) => ({ info, by: 'body' }))
  if (matches.length === 1) return matches[0]!
  const signature = given.length === 0 ? `public.${name} without parameters` : `public.${name}(${listed(given)})`
  if (matches.length > 1) {
    const overloads = matches.map((match) => `public.${name}(${match.info.inputs.map((input) => `${input.name} => ${input.type}`.trim()).join(', ')})`)
    throw restError(300, 'PGRST203', `Could not choose the best candidate function between: ${overloads.join(', ')}`, null, 'Try renaming the parameters or the function itself in the database so function overloading can be resolved')
  }
  const searched = given.length === 0 ? `public.${name} without parameters` : `public.${name} with parameters ${listed(given)}`
  const hint = candidates[0] ? `Perhaps you meant to call the function public.${name}(${candidates[0].inputs.map((input) => input.name).join(', ')})` : null
  throw restError(404, 'PGRST202', `Could not find the function ${signature} in the schema cache`, `Searched for the function ${searched} or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.`, hint)
}

/**
 * The call in FROM, its rows named after the function: arguments read by name from the JSON object `args` as the types
 * the catalog gives them, so Postgres converts them as it reads JSON into a row; or `args` itself as the one argument.
 * Types come from the catalog, never from the request.
 */
export const callSource = (call: Call, args: unknown): RowSource => {
  const fn = sql.id('public', call.info.name)
  const alias = call.info.name
  const scalar = call.info.returns !== 'row'
  if (call.by === 'body') return { from: sql`${fn}(cast(${JSON.stringify(args)} as ${sql.raw(call.info.inputs[0]!.type)})) as ${sql.id(alias)}`, alias, scalar }
  if (call.args.length === 0) return { from: sql`${fn}() as ${sql.id(alias)}`, alias, scalar }
  const types = call.info.inputs.filter((input) => call.args.includes(input.name)).map((input) => sql`${sql.id(input.name)} ${sql.raw(input.type)}`)
  const named = sql.join(call.args.map((arg) => sql`${sql.id(arg)} := pgrst_args.${sql.id(arg)}`))
  return { from: sql`json_to_record(${JSON.stringify(args)}::json) as pgrst_args(${sql.join(types)}) cross join lateral ${fn}(${named}) as ${sql.id(alias)}`, alias, scalar }
}
