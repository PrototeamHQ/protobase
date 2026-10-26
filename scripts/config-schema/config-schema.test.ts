import { readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { configSchemaText, schemaFile } from './config-schema'

const root = path.join(import.meta.dirname, '..', '..')
const published = readFileSync(schemaFile, 'utf8')
const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(published))

describe('the JSON Schema of protobase.config.json', () => {
  it('is the one ProtobaseConfig makes now: bun run config:schema writes it again', () => {
    expect(published).toBe(configSchemaText())
  }, 60_000)

  it("takes the ERP's config as JSON, with its $env values", () => {
    const erp = JSON.parse(readFileSync(path.join(root, 'packages/cli/tests/fixtures/erp-json/protobase.config.json'), 'utf8'))
    expect(validate({ $schema: './node_modules/@protobase/config/schema.json', ...erp })).toBe(true)
  })

  it('refuses a key no config has, a value of the wrong type and an argument type that does not exist', () => {
    expect(validate({ timezon: 'UTC' })).toBe(false)
    expect(validate({ auth: { roles: 3 } })).toBe(false)
    expect(validate({ jobs: { 'send-invoice': { arguments: { invoiceId: 'integr' } } } })).toBe(false)
    expect(validate({ files: { providers: { archive: { kind: 'ftp' } } } })).toBe(false)
  })

  it('takes an $env value wherever a value goes', () => {
    expect(validate({ secret: { $env: 'PROTOBASE_SECRET' }, jobs: { nightly: { schedule: { $env: 'NIGHTLY', default: '0 2 * * *' } } } })).toBe(true)
    expect(validate({ secret: { $env: 'PROTOBASE_SECRET', fallback: 'x' } })).toBe(false)
  })
})
