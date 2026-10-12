import { describe, expect, it } from 'vitest'
import { checkSourceNames, sourceOptions, sourcesFor } from './source-settings'

const desk = { url: 'https://desk.example.com/api/v1', label: 'Service desk', resources: ['tickets', 'ticket_notes'] }
const cloud = { url: 'https://cloud.example.com/api/v1', label: 'Cloud', resources: ['tasks'], roles: ['admin', 'ai'] }

describe('sourceOptions', () => {
  it('lists the options first, then the sources PROTOBASE_SOURCES adds', () => {
    expect(sourceOptions([desk], { PROTOBASE_SOURCES: JSON.stringify([cloud]) })).toEqual([desk, cloud])
  })

  it('is empty without sources, and when the option is false', () => {
    expect(sourceOptions(undefined, {})).toEqual([])
    expect(sourceOptions(undefined, { PROTOBASE_SOURCES: ' ' })).toEqual([])
    expect(sourceOptions(false, { PROTOBASE_SOURCES: JSON.stringify([cloud]) })).toEqual([])
  })

  it('drops a trailing slash and the spaces around the url and label', () => {
    expect(sourceOptions([{ ...desk, url: ' https://desk.example.com/api/v1/ ', label: ' Service desk ' }], {})).toEqual([desk])
  })

  it('refuses a variable that is not a JSON list', () => {
    expect(() => sourceOptions(undefined, { PROTOBASE_SOURCES: 'https://desk.example.com/api/v1' })).toThrow('PROTOBASE_SOURCES is not JSON')
    expect(() => sourceOptions(undefined, { PROTOBASE_SOURCES: JSON.stringify(desk) })).toThrow('PROTOBASE_SOURCES is not a list')
  })

  it('refuses a source that cannot work, naming where it is listed', () => {
    expect(() => sourceOptions(undefined, { PROTOBASE_SOURCES: '["desk"]' })).toThrow('PROTOBASE_SOURCES[0] is not an object')
    expect(() => sourceOptions([{ ...desk, url: 'desk.example.com' }], {})).toThrow("options.sources[0]'s url is not a URL")
    expect(() => sourceOptions([{ ...desk, url: 'ftp://desk.example.com' }], {})).toThrow('must start with https:// or http://')
    expect(() => sourceOptions([{ ...desk, label: ' ' }], {})).toThrow('options.sources[0] needs a label')
    expect(() => sourceOptions([{ ...desk, resources: [] }], {})).toThrow('options.sources[0] needs resources')
    expect(() => sourceOptions([{ ...desk, resources: ['tickets/notes'] }], {})).toThrow('lists the resource "tickets/notes", which holds a slash')
    expect(() => sourceOptions([{ ...desk, resources: ['-'] }], {})).toThrow("which is the prefix of the app's own pages")
    expect(() => sourceOptions(undefined, { PROTOBASE_SOURCES: JSON.stringify([{ ...desk, resource: ['tickets'] }]) })).toThrow('PROTOBASE_SOURCES[0] has "resource", which a source does not take')
    expect(() => sourceOptions(undefined, { PROTOBASE_SOURCES: JSON.stringify([{ ...desk, roles: 'admin' }]) })).toThrow('has roles that are not a list')
  })

  it('refuses a source listed twice, and a resource drawn from two sources', () => {
    expect(() => sourceOptions([desk], { PROTOBASE_SOURCES: JSON.stringify([{ ...desk, url: `${desk.url}/` }]) })).toThrow('The source https://desk.example.com/api/v1 is listed twice')
    expect(() => sourceOptions([desk, { ...cloud, resources: ['tickets'] }], {})).toThrow('The resource "tickets" is drawn from both https://desk.example.com/api/v1 and https://cloud.example.com/api/v1')
    expect(() => sourceOptions([{ ...desk, resources: ['tickets', 'tickets'] }], {})).toThrow('The resource "tickets" is drawn from https://desk.example.com/api/v1 twice')
  })
})

describe('checkSourceNames', () => {
  it("refuses a resource the app has as a resource or page of its own", () => {
    expect(() => checkSourceNames([desk], { resources: ['tickets'], pages: [] })).toThrow(
      'The source Service desk (https://desk.example.com/api/v1) draws the resource "tickets", which is also a resource of the app\'s own',
    )
    expect(() => checkSourceNames([desk], { resources: [], pages: ['ticket_notes'] })).toThrow('which is also a page of the app\'s own')
    expect(() => checkSourceNames([desk, cloud], { resources: ['orders'], pages: ['overview'] })).not.toThrow()
  })
})

describe('sourcesFor', () => {
  it('names a source without roles to everyone, and one with roles to callers holding one, without its roles', () => {
    expect(sourcesFor([desk, cloud], ['sales'])).toEqual([desk])
    expect(sourcesFor([desk, cloud], ['ai'])).toEqual([desk, { url: cloud.url, label: cloud.label, resources: cloud.resources }])
  })
})
