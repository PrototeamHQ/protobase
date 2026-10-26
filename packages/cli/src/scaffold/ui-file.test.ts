import { describe, expect, it } from 'vitest'
import { isSecretLike, listColumns, listSort, renderUiFile, type UiField } from './ui-file'

const field = (name: string, type: string, extra: Partial<UiField> = {}): UiField => ({ name, type, sortable: false, role: 'plain', ...extra })

describe('listColumns', () => {
  it('starts with a key people read, such as a SKU', () => {
    expect(listColumns([field('sku', 'relation', { role: 'key' }), field('on_hand', 'integer')])).toEqual(['sku', 'on_hand'])
  })

  it('leaves out a uuid key, then shows the records a record points at before its other fields', () => {
    const fields = [field('id', 'uuid', { role: 'key' }), field('number', 'text'), field('status', 'enum'), field('total', 'decimal'), field('customer_id', 'relation'), field('ordered_on', 'date')]
    expect(listColumns(fields)).toEqual(['customer_id', 'number', 'status', 'total', 'ordered_on'])
  })

  it('shows two of the records a record points at, at most', () => {
    const fields = [field('id', 'uuid', { role: 'key' }), field('a_id', 'relation'), field('b_id', 'relation'), field('c_id', 'relation'), field('title', 'text')]
    expect(listColumns(fields)).toEqual(['a_id', 'b_id', 'title'])
  })

  it('never lists a secret-like column', () => {
    const fields = [field('id', 'integer', { role: 'key' }), ...['email', 'password_hash', 'accessToken', 'private_key', 'api_key', 'name'].map((name) => field(name, 'text'))]
    expect(listColumns(fields)).toEqual(['id', 'email', 'name'])
  })

  it('falls back to the key when nothing else fits', () => {
    expect(listColumns([field('id', 'uuid', { role: 'key' }), field('created_at', 'timestamp')])).toEqual(['id'])
  })
})

describe('isSecretLike', () => {
  it('reads the words of snake and camel case names', () => {
    expect(['password', 'password_hash', 'passwordHash', 'refresh_token', 'idToken', 'client_secret', 'privateKey', 'API_KEY', 'salt'].filter((name) => !isSecretLike(name))).toEqual([])
    expect(['email', 'tokens_used_count', 'hashtag', 'monkey', 'key', 'private_notes'].filter(isSecretLike)).toEqual([])
  })
})

describe('listSort', () => {
  it('sorts by the sortable date the records were created on, else by another sortable date', () => {
    const created = field('created_at', 'timestamp', { sortable: true })
    expect(listSort([field('ordered_on', 'date', { sortable: true }), created])).toBe('created_at')
    expect(listSort([field('ordered_on', 'date', { sortable: true }), field('created_at', 'timestamp')])).toBe('ordered_on')
    expect(listSort([field('createdAt', 'timestamp', { sortable: true })])).toBe('createdAt')
  })

  it('has no sort without a sortable date, as the API refuses an order no index serves', () => {
    expect(listSort([field('created_at', 'timestamp'), field('total', 'decimal', { sortable: true })])).toBeUndefined()
  })
})

describe('renderUiFile', () => {
  it('writes the sort with the columns, newest first', () => {
    const target = { resource: 'orders', identifier: 'orders', tableName: 'orders', fields: [field('id', 'integer', { role: 'key', sortable: true }), field('placed_at', 'timestamp', { sortable: true })] }
    expect(renderUiFile(target, ['list'])).toContain(`  .list((r) => ({ columns: [r.id, r.placed_at], sort: [[r.placed_at, 'desc']] }))`)
  })
})
