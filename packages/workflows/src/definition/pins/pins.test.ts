import { describe, expect, it } from 'vitest'
import { checkDefinition } from '../check-definition'
import type { Definition } from '../types'
import { pinProblems } from './check-pins'
import { fits, pinType, pinTypeText } from './pin-type'
import { expressionReferences, parseReference, readText, referenceValue } from './references'
import { resolveSchema, schemaAt, type RecordSchemas } from './resolve-schema'
import type { PinSchemas } from './pin-sources'

const contact = { type: 'object', title: 'contacts', properties: { id: { type: 'string' }, name: { type: 'string' }, age: { type: 'integer' } } }
const records: RecordSchemas = (resource, use) => (resource === 'contacts' ? (use === 'read' ? contact : { ...contact, properties: { name: { type: 'string' }, age: { type: 'integer' } } }) : undefined)

const schemas: PinSchemas = {
  inputs: {
    'app:http': { type: 'object', properties: { url: { type: 'string' }, headers: { type: 'object', additionalProperties: { type: 'string' } } } },
    'app:records.update': { type: 'object', properties: { resource: { type: 'string' }, key: { anyOf: [{ type: 'string' }, { type: 'number' }] }, data: { type: 'object', 'x-record-of': 'resource', 'x-record-use': 'write' } } },
  },
  outputs: {
    'app:http': { type: 'object', properties: { status: { type: 'integer' }, body: { 'x-schema-of': 'body_schema' } } },
    'app:record': { type: 'object', properties: { record: { 'x-record-of': 'resource' } } },
  },
  records,
}

const workflow = (args: Record<string, unknown>, update: Record<string, unknown>): Definition => ({
  trigger: { 'app:record': { resource: 'contacts' } },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Fetch',
    States: {
      Fetch: { Type: 'Task', Resource: 'app:http', Arguments: args, Assign: { fetch: '{% $states.result %}' }, Next: 'Save' },
      Save: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', ...update }, End: true },
    },
  },
})

describe('pins', () => {
  it('types a pin by its schema and lets a value fit where every kind it can be is taken', () => {
    expect(pinType({ type: 'integer' })).toEqual({ kinds: ['integer'] })
    expect(pinType({ anyOf: [{ type: 'string' }, { type: 'array' }] })).toEqual({ kinds: ['string', 'array'] })
    expect(pinType({ enum: ['a', 'b'] })).toEqual({ kinds: ['string'] })
    expect(pinType({ title: 'Body' })).toEqual({ kinds: 'any', title: 'Body' })
    expect(fits(pinType({ type: 'integer' }), pinType({ type: 'number' }))).toBe(true)
    expect(fits(pinType({ type: 'number' }), pinType({ type: 'integer' }))).toBe(false)
    expect(fits(pinType({ type: ['string', 'integer'] }), pinType({ type: 'string' }))).toBe(false)
    expect(fits(pinType({}), pinType({ type: 'string' }))).toBe(true)
    expect(pinTypeText(pinType({ type: ['string', 'integer'] }))).toBe('text or a whole number')
    // A schema's own type applies beside its branches
    expect(pinType({ type: 'string', anyOf: [{ type: 'string' }, { type: 'null' }] })).toEqual({ kinds: ['string'] })
  })

  it('reads a value that is one read by name, and writes it back the same', () => {
    expect(parseReference('{% $fetch.body.ip %}')).toEqual({ base: { variable: 'fetch' }, path: ['body', 'ip'] })
    expect(parseReference('{%  $states.context.Execution.Input.record.`first name` %}')).toEqual({ base: { input: true }, path: ['record', 'first name'] })
    for (const other of ['{% $fetch.body & "x" %}', '{% $states.result %}', '{% $uppercase($x) %}', 'plain', 3]) expect(parseReference(other)).toBeUndefined()
    expect(referenceValue({ base: { input: true }, path: ['record', 'first name'] })).toBe('{% $states.context.Execution.Input.record.`first name` %}')
    expect(readText({ base: { variable: 'fetch' }, path: [] })).toBe('$fetch')
    // A name JSONata reads as a value is backticked
    expect(referenceValue({ base: { variable: 'fetch' }, path: ['body', 'null'] })).toBe('{% $fetch.body.`null` %}')
  })

  it('fills in the records and schemas a type\'s arguments name, and finds a value\'s schema down a path', () => {
    const output = resolveSchema(schemas.outputs['app:http']!, { body_schema: { type: 'object', properties: { ip: { type: 'string' } } } }, records)
    expect(schemaAt(output, ['body', 'ip'])).toEqual({ type: 'string' })
    expect(schemaAt(resolveSchema(schemas.outputs['app:http']!, {}, records), ['body', 'ip'])).toBeUndefined()
    expect(schemaAt(resolveSchema(schemas.outputs['app:record']!, { resource: 'contacts' }, records), ['record', 'age'])).toEqual({ type: 'integer' })
    expect(resolveSchema({ 'x-record-of': 'resource' }, { resource: '{% $r %}' }, records)).toEqual({})
    expect(schemaAt(schemas.inputs['app:http'], ['headers', 'Accept'])).toEqual({ type: 'string' })
    // A field that branches type otherwise is any of their types, and of any type where one branch does not say
    expect(schemaAt({ anyOf: [{ properties: { value: { type: 'string' } } }, { properties: { value: { type: 'number' } } }] }, ['value'])).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }] })
    expect(schemaAt({ anyOf: [{ properties: { value: { type: 'string' } } }, { properties: {} }] }, ['value'])).toBeUndefined()
    expect(schemaAt({ anyOf: [{ properties: { value: { type: 'string' } } }, true] }, ['value'])).toBeUndefined()
    // One record or a list of them, as the argument named holds one or a list
    const created = { 'x-one-or-many-of': 'data', anyOf: [{ type: 'object' }, { type: 'array' }] }
    expect(resolveSchema(created, { data: { name: 'a' } }, records)).toEqual({ type: 'object' })
    expect(resolveSchema(created, { data: [{ name: 'a' }] }, records)).toEqual({ type: 'array' })
    expect(resolveSchema(created, { data: '{% $rows %}' }, records)).toEqual({ anyOf: [{ type: 'object' }, { type: 'array' }] })
  })

  it('reports an argument that reads a value of a type it does not take, naming both, and lets the rest pass', () => {
    const typed = { url: 'https://example.com', body_schema: { type: 'object', properties: { ip: { type: 'string' }, hits: { type: 'integer' } } } }
    expect(pinProblems(workflow(typed, { key: '{% $states.context.Execution.Input.record.id %}', data: { name: '{% $fetch.body.ip %}', age: '{% $fetch.body.hits %}' } }), schemas)).toEqual([])
    expect(pinProblems(workflow(typed, { key: '{% $fetch.status %}', data: { name: '{% $fetch.status %}', age: '{% $fetch.body.ip %}' } }), schemas)).toEqual([
      { state: 'Save', field: 'Arguments.data.name', message: 'reads $fetch.status, a whole number, where data.name takes text' },
      { state: 'Save', field: 'Arguments.data.age', message: 'reads $fetch.body.ip, text, where data.age takes a whole number' },
    ])
    expect(pinProblems(workflow({ url: '{% $states.context.Execution.Input.record.age %}' }, { key: '1', data: {} }), schemas)).toEqual([
      { state: 'Fetch', field: 'Arguments.url', message: 'reads $states.context.Execution.Input.record.age, a whole number, where url takes text' },
    ])
    // Without a declared body, its fields are of any type
    expect(pinProblems(workflow({ url: 'https://example.com' }, { key: '1', data: { age: '{% $fetch.body.ip %}' } }), schemas)).toEqual([])
    // A Block's steps keep their variables to themselves, so one of the same name inside it leaves the read outside typed
    const blocked = workflow({ url: 'https://example.com' }, { key: '1', data: { name: '{% $fetch.status %}' } })
    blocked.stateMachine.States.Keep = { Type: 'Block', Processor: { StartAt: 'Inner', States: { Inner: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://b.example' }, Assign: { fetch: '{% $states.result %}' }, End: true } } }, Cache: { Ttl: '1 hour' }, End: true } as never
    expect(pinProblems(blocked, schemas)).toEqual([{ state: 'Save', field: 'Arguments.data.name', message: 'reads $fetch.status, a whole number, where data.name takes text' }])
    // A whole-result keep however spaced still types the reads of it
    const spaced = workflow({ url: 'https://example.com' }, { key: '1', data: { name: '{% $fetch.status %}' } })
    ;(spaced.stateMachine.States.Fetch as { Assign: Record<string, string> }).Assign = { fetch: '{%  $states.result  %}' }
    expect(pinProblems(spaced, schemas)).toHaveLength(1)
    // A Block's steps are checked among themselves
    const inBlock: Definition = {
      trigger: { manual: {} },
      stateMachine: {
        QueryLanguage: 'JSONata',
        StartAt: 'Keep',
        States: {
          Keep: {
            Type: 'Block',
            Processor: {
              StartAt: 'Fetch',
              States: {
                Fetch: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://example.com' }, Assign: { fetch: '{% $states.result %}' }, Next: 'Save' },
                Save: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', key: '1', data: { name: '{% $fetch.status %}' } }, End: true },
              },
            },
            Cache: { Ttl: '1 hour' },
            End: true,
          },
        },
      },
    }
    expect(pinProblems(inBlock, schemas)).toEqual([{ state: 'Keep/Save', field: 'Arguments.data.name', message: 'reads $fetch.status, a whole number, where data.name takes text' }])
    // A read deeper in an argument is checked against the schema at its place
    const deep: PinSchemas = { ...schemas, inputs: { ...schemas.inputs, 'app:http': { type: 'object', properties: { url: { type: 'string' }, payload: { type: 'object', properties: { profile: { type: 'object', properties: { age: { type: 'integer' } } } } } } } } }
    expect(pinProblems(workflow({ url: 'https://example.com', payload: { profile: { age: '{% $states.context.Execution.Input.record.name %}' } } }, { key: '1', data: {} }), deep)).toEqual([
      { state: 'Fetch', field: 'Arguments.payload.profile.age', message: 'reads $states.context.Execution.Input.record.name, text, where payload.profile.age takes a whole number' },
    ])
  })

  it('runs as part of the save check when the options give the pins', () => {
    const definition = workflow({ url: '{% $states.context.Execution.Input.record.age %}' }, { key: '1', data: {} })
    const options = { resources: ['app:http', 'app:records.update'], triggers: { 'app:record': () => [] } }
    expect(checkDefinition(definition, options).filter((problem) => problem.field === 'Arguments.url')).toEqual([])
    expect(checkDefinition(definition, { ...options, pins: schemas }).filter((problem) => problem.field === 'Arguments.url')).toEqual([
      { state: 'Fetch', field: 'Arguments.url', message: 'reads $states.context.Execution.Input.record.age, a whole number, where url takes text' },
    ])
  })
})

describe('the reads of an expression', () => {
  it('finds every read by name, however the expression combines them, and no name it binds itself', () => {
    // A block that binds a name of a workflow variable reads its own one inside, the workflow's outside
    expect(expressionReferences("{% $fetch.body.ip & ($fetch := {'name': 'local'}; $fetch.name) %}")).toEqual([{ base: { variable: 'fetch' }, path: ['body', 'ip'] }])
    expect(expressionReferences("{% $ip.body.ip & ' / ' & $uuid.body.uuid & $string($count($ip.headers)) %}")).toEqual([
      { base: { variable: 'ip' }, path: ['body', 'ip'] },
      { base: { variable: 'uuid' }, path: ['body', 'uuid'] },
      { base: { variable: 'ip' }, path: ['headers'] },
    ])
    expect(expressionReferences("{% $states.context.Steps.Save.Status = 'SUCCEEDED' and $states.context.Execution.Input.ok %}")).toEqual([
      { base: { step: 'Save' }, path: ['Status'] },
      { base: { input: true }, path: ['ok'] },
    ])
    expect(expressionReferences('{% ($n := 2; $n * $total) %}')).toEqual([{ base: { variable: 'total' }, path: [] }])
    expect(expressionReferences('plain text')).toEqual([])
  })
})
