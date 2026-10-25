import { describe, expect, it } from 'vitest'
import { documentTitle, titleParts } from './document-title'
import type { ListAddress } from './current-address'

const list: ListAddress = { kind: 'list', resource: 'companies', display: 'table', filter: '', orderBy: '', filterLayout: 'bar' }
const companies = { resourceLabel: 'Companies', singular: 'Company' }
const title = (input: Parameters<typeof titleParts>[0]) => documentTitle(titleParts(input), 'Protobase')

describe('documentTitle', () => {
  it('names a record, its list and the app', () => {
    expect(title({ address: { kind: 'record', resource: 'companies', key: '7' }, ...companies, recordTitle: 'Nordlicht Systemtechnik GmbH' })).toBe('Nordlicht Systemtechnik GmbH · Companies · Protobase')
  })

  it('names only the list while the record loads', () => {
    expect(title({ address: { kind: 'record', resource: 'companies', key: '7' }, ...companies, recordLoading: true })).toBe('Companies · Protobase')
  })

  it('names a record that could not load by its key', () => {
    expect(title({ address: { kind: 'record', resource: 'companies', key: '7' }, ...companies })).toBe('7 · Companies · Protobase')
  })

  it('names a list', () => {
    expect(title({ address: list, ...companies })).toBe('Companies · Protobase')
  })

  it('names a new record as its New button does', () => {
    expect(title({ address: { kind: 'create', resource: 'companies' }, ...companies })).toBe('New company · Companies · Protobase')
  })

  it('names a composed page', () => {
    expect(title({ address: { kind: 'page', page: 'overview' }, page: { title: 'Overview' } })).toBe('Overview · Protobase')
    expect(title({ address: { kind: 'page', page: 'account', tab: 'security' }, page: { title: 'Account', tab: 'Sign-in & security' } })).toBe('Sign-in & security · Account · Protobase')
  })

  it('names an account page', () => {
    expect(title({ address: undefined, accountPage: 'Sign-in & security' })).toBe('Sign-in & security · Protobase')
  })

  it('names only the app without an address', () => {
    expect(title({ address: undefined })).toBe('Protobase')
  })
})
