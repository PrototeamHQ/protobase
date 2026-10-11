import { describe, expect, it } from 'vitest'
import { camelCase, humanize, humanizeSingular, singular, snakeName } from './names'

describe('snakeName', () => {
  it.each([
    ['order_id', 'order_id'],
    ['id', 'id'],
    ['EMP_ID', 'emp_id'],
    ['ACTIVE_FLG', 'active_flg'],
    ['firstName', 'first_name'],
    ['FirstName', 'first_name'],
    ['HTTPServer', 'http_server'],
    ['line_1', 'line_1'],
    ['2fa_secret', 'c2fa_secret'],
    ['EMP_MASTER', 'emp_master'],
  ])('%s -> %s', (column, field) => {
    expect(snakeName(column)).toBe(field)
  })

  it('rejects names without letters or digits', () => {
    expect(() => snakeName('___')).toThrow('Cannot derive a field name')
  })
})

describe('camelCase', () => {
  it.each([
    ['order_id', 'orderId'],
    ['id', 'id'],
    ['EMP_ID', 'empId'],
    ['ACTIVE_FLG', 'activeFlg'],
    ['firstName', 'firstName'],
    ['FirstName', 'firstName'],
    ['line_1', 'line1'],
    ['2fa_secret', 'c2faSecret'],
    ['EMP_MASTER', 'empMaster'],
  ])('%s -> %s', (column, field) => {
    expect(camelCase(column)).toBe(field)
  })

  it('rejects names without letters or digits', () => {
    expect(() => camelCase('___')).toThrow('Cannot derive a field name')
  })
})

describe('singular and humanize', () => {
  it.each([
    ['companies', 'company'],
    ['orders', 'order'],
    ['addresses', 'address'],
    ['status', 'status'],
    ['news', 'new'],
  ])('singular %s -> %s', (plural, one) => {
    expect(singular(plural)).toBe(one)
  })

  it('humanizes table names', () => {
    expect(humanize('order_lines')).toBe('Order lines')
    expect(humanizeSingular('order_lines')).toBe('Order line')
    expect(humanizeSingular('EMP_MASTER')).toBe('Emp master')
    expect(humanize('companyTags')).toBe('Company tags')
  })
})
