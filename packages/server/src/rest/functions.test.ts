import { describe, expect, it } from 'vitest'
import { compiled } from '../../../../test-support/compile-sql'
import { callSource, chooseFunction, type FunctionInfo } from './functions'
import { RestError } from './rest-error'

const add: FunctionInfo = { name: 'add', inputs: [{ name: 'a', type: 'integer' }, { name: 'b', type: 'integer' }], defaults: 0, returns: 'scalar', set: false }
const openTodos: FunctionInfo = { name: 'open_todos', inputs: [{ name: 'min_priority', type: 'integer' }], defaults: 1, returns: 'row', set: true }
const takesJson: FunctionInfo = { name: 'hook', inputs: [{ name: '', type: 'jsonb' }], defaults: 0, returns: 'void', set: false }

const refusal = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(RestError)
    return { status: (error as RestError).status, ...(error as RestError).body }
  }
  throw new Error('Not refused')
}

describe('chooseFunction', () => {
  it('takes the overload with every name given and every input without a default', () => {
    expect(chooseFunction('add', [add], ['b', 'a'])).toEqual({ info: add, by: 'name', args: ['a', 'b'] })
    expect(chooseFunction('open_todos', [openTodos], [])).toEqual({ info: openTodos, by: 'name', args: [] })
  })

  it('passes the body to a single unnamed json argument', () => {
    expect(chooseFunction('hook', [takesJson], ['event'])).toEqual({ info: takesJson, by: 'body' })
  })

  it('is PGRST202 for no match, worded as PostgREST words it', () => {
    expect(refusal(() => chooseFunction('add', [add], ['c', 'a']))).toEqual({
      status: 404,
      code: 'PGRST202',
      message: 'Could not find the function public.add(a, c) in the schema cache',
      details: 'Searched for the function public.add with parameters a, c or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.',
      hint: 'Perhaps you meant to call the function public.add(a, b)',
    })
    expect(refusal(() => chooseFunction('nothing', [], []))).toMatchObject({ message: 'Could not find the function public.nothing without parameters in the schema cache', hint: null })
  })

  it('is PGRST203 for more than one match', () => {
    const other = { ...add, inputs: [{ name: 'a', type: 'text' }, { name: 'b', type: 'text' }] }
    expect(refusal(() => chooseFunction('add', [add, other], ['a', 'b']))).toMatchObject({ status: 300, code: 'PGRST203' })
  })
})

describe('callSource', () => {
  it('reads arguments by name from the JSON object as the catalog types them', () => {
    const source = callSource({ info: add, by: 'name', args: ['a', 'b'] }, { a: 1, b: 2 })
    expect(source).toMatchObject({ alias: 'add', scalar: true })
    expect(compiled(source.from)).toEqual({
      sql: 'json_to_record($1::json) as pgrst_args("a" integer, "b" integer) cross join lateral "public"."add"("a" := pgrst_args."a", "b" := pgrst_args."b") as "add"',
      parameters: ['{"a":1,"b":2}'],
    })
  })

  it('calls without arguments, or with the body as the one argument', () => {
    expect(compiled(callSource({ info: openTodos, by: 'name', args: [] }, {}).from).sql).toBe('"public"."open_todos"() as "open_todos"')
    expect(compiled(callSource({ info: takesJson, by: 'body' }, { event: 1 }).from)).toEqual({ sql: '"public"."hook"(cast($1 as jsonb)) as "hook"', parameters: ['{"event":1}'] })
  })
})
