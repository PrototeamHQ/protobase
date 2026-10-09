import { describe, expect, it } from 'vitest'
import { f } from './fields'
import type { ResourceModel } from './model'
import { where } from './filter'
import { resource } from './resource'
import type { InferRecord, RecordKey } from './resource-types'

const article = resource('article')
  .table('public.articles')
  .fields({
    id: f.integer().readOnly(),
    title: f.text().filterable().sortable().alias('headline'),
    status: f.enum(['draft', 'live']).default('draft'),
    authorId: f.relation('author').column('writer_id'),
    publishedAt: f.timestamp().optional().sortable(),
    deletedAt: f.timestamp().optional(),
    organizationId: f.uuid(),
    legacyBlob: null,
  })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.deletedAt)
  .tenant((r) => r.organizationId)

const col = (name: string, column: string, type: ResourceModel['fields'][string]['type'], extra = {}) => ({
  name,
  column,
  type,
  nullable: false,
  readOnly: false,
  filterable: false,
  sortable: false,
  aliases: [],
  ...extra,
})

describe('resource builder', () => {
  it('builds the expected ResourceModel', () => {
    expect(article.toModel()).toEqual({
      name: 'article',
      table: { schema: 'public', name: 'articles' },
      fields: {
        id: col('id', 'id', 'integer', { readOnly: true }),
        title: col('title', 'title', 'text', { filterable: true, sortable: true, aliases: ['headline'] }),
        status: col('status', 'status', 'enum', { enumValues: ['draft', 'live'], default: { value: 'draft' } }),
        authorId: col('authorId', 'writer_id', 'relation', {
          relation: { resource: 'author', columns: ['writer_id'] },
        }),
        publishedAt: col('publishedAt', 'published_at', 'timestamp', { nullable: true, sortable: true }),
        deletedAt: col('deletedAt', 'deleted_at', 'timestamp', { nullable: true }),
        organizationId: col('organizationId', 'organization_id', 'uuid'),
      },
      primaryKey: ['id'],
      softDelete: 'deletedAt',
      tenant: 'organizationId',
    })
  })

  it('exposes defaults, serializable', () => {
    const fields = article.toModel().fields
    expect(fields.status!.default).toEqual({ value: 'draft' })
    expect(fields.title!.default).toBeUndefined()
    const withDb = resource('d').table('d').fields({ id: f.integer().dbDefault(), at: f.timestamp().dbDefault() }).primaryKey((r) => r.id).toModel()
    expect(withDb.fields.id!.default).toEqual({ db: true })
    expect(JSON.parse(JSON.stringify(fields.status))).toEqual(fields.status)
  })

  it('records ignored columns without exposing them', () => {
    expect(article.toModel().fields).not.toHaveProperty('legacyBlob')
    expect(article.ignoredColumns()).toEqual(['legacy_blob'])
  })

  it('records search fields in the model', () => {
    const searchable = article.search((r) => [r.title])
    expect(searchable.toModel().search).toEqual(['title'])
    expect(article.toModel().search).toBeUndefined()
    // @ts-expect-error unknown field
    expect(() => article.search((r) => [r.nope])).toThrow('Unknown field')
  })

  it('records the fields searched by the end of their digits', () => {
    const model = article.search((r) => [r.title, r.status.digitsEnd()]).toModel()
    expect([model.search, model.searchMatch]).toEqual([['title', 'status'], { status: 'digitsEnd' }])
    expect(article.search((r) => [r.title]).toModel()).not.toHaveProperty('searchMatch')
  })

  it('supports composite primary keys and unqualified tables', () => {
    const line = resource('line')
      .table('lines')
      .fields({ orderId: f.integer(), sku: f.text() })
      .primaryKey((r) => [r.orderId, r.sku])
      .toModel()
    expect(line.table).toEqual({ name: 'lines' })
    expect(line.primaryKey).toEqual(['orderId', 'sku'])
    expect(line.softDelete).toBeUndefined()
  })

  it('refs reject unknown and ignored names', () => {
    const base = resource('a').table('a').fields({ id: f.integer(), hidden: null })
    // @ts-expect-error unknown field
    expect(() => base.primaryKey((r) => r.nope)).toThrow('Unknown field "nope"')
    // @ts-expect-error ignored fields are not referable
    expect(() => base.primaryKey((r) => r.hidden)).toThrow('Unknown field "hidden"')
  })

  it('fails fast on incomplete resources', () => {
    expect(() => resource('a').toModel()).toThrow('no table')
    expect(() => resource('a').table('a').toModel()).toThrow('no fields')
    expect(() => resource('a').table('a').fields({}).toModel()).toThrow('no primary key')
    expect(() => resource('a').table('a.b.c').fields({}).primaryKey(() => ({ name: 'x' })).toModel()).toThrow(
      'Invalid table',
    )
  })

  it('stores validators and access functions', () => {
    const read = () => true
    const checked = article
      .validate((a) => (a.title === 'x' ? [{ field: 'title', message: 'bad' }] : undefined))
      .access({ read })
    expect(checked.validators).toHaveLength(1)
    expect(checked.validators[0]!({ title: 'x' } as never)).toEqual([{ field: 'title', message: 'bad' }])
    expect(checked.accessRules.read).toBe(read)
    expect(article.accessRules).toEqual({})
  })

  it('access functions may return a verdict or a filter', () => {
    const scoped = article.access({
      read: () => 'status = "live"',
      list: async () => where.eq('status', 'live'),
      update: () => true,
    })
    expect(Object.keys(scoped.accessRules)).toEqual(['read', 'list', 'update'])
  })

  it('validates records with the zod object schema', () => {
    const schema = article.recordSchema()
    const record = {
      id: 1,
      title: 't',
      status: 'live',
      authorId: 3,
      publishedAt: null,
      deletedAt: null,
      organizationId: '0b5a4f0e-6f2a-4a3c-9d4e-1f2a3b4c5d6e',
    }
    expect(schema.safeParse(record).success).toBe(true)
    expect(schema.safeParse({ ...record, status: 'other' }).success).toBe(false)
    expect(schema.safeParse({ ...record, legacyBlob: 1 }).data).not.toHaveProperty('legacyBlob')
  })
})

describe('inferred types', () => {
  it('infers records and keys', () => {
    const record: InferRecord<typeof article> = {
      id: 1,
      title: 't',
      status: 'live',
      authorId: 3,
      publishedAt: null,
      deletedAt: null,
      organizationId: 'u',
    }
    // @ts-expect-error status is an enum
    const bad: InferRecord<typeof article> = { ...record, status: 'other' }
    // @ts-expect-error ignored fields are not part of the record
    const extra: InferRecord<typeof article>['legacyBlob'] = 1

    const line = resource('line')
      .fields({ orderId: f.integer(), sku: f.text() })
      .primaryKey((r) => [r.orderId, r.sku])
    const composite: RecordKey<typeof line> = [1, 'a']
    const single: RecordKey<typeof article> = 5
    // @ts-expect-error tuple order matters
    const wrong: RecordKey<typeof line> = ['a', 1]

    expect([record, bad, extra, composite, single, wrong]).toHaveLength(6)
  })
})
