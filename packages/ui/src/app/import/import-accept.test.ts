import { describe, expect, it } from 'vitest'
import { importAccept } from './import-accept'

const iPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const androidApp = 'Mozilla/5.0 (Linux; Android 16; Pixel 9a Build/BP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36'
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const accepted = (userAgent: string) => importAccept(userAgent).split(',')

describe('importAccept', () => {
  it('offers workbooks, CSV and JSON files by extension and media type everywhere', () => {
    for (const userAgent of [iPhone, androidApp, desktop]) {
      expect(accepted(userAgent)).toEqual(expect.arrayContaining(['.xlsx', '.csv', '.json', 'text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']))
    }
  })

  it('offers on Android a CSV its provider labels with another type, and a file it labels generically', () => {
    expect(accepted(androidApp)).toEqual(expect.arrayContaining(['text/comma-separated-values', 'application/csv', 'text/x-csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']))
  })

  it('keeps the generic types out where the picker matches extensions', () => {
    for (const userAgent of [iPhone, desktop]) expect(accepted(userAgent)).not.toContain('application/octet-stream')
  })
})
