import { describe, expect, it } from 'vitest'
import { bulkRecipients, checkBulkOptions, refuseUnlinkedBulk } from './bulk-options'

describe('bulk options', () => {
  it('need a topic that is a plain name', () => {
    expect(() => checkBulkOptions('Email "news"', { bulk: true })).toThrow('Email "news" is bulk mail without a topic')
    expect(() => checkBulkOptions('Email "news"', { bulk: true, topic: 'Weekly News' })).toThrow(/lowercase letter/)
    expect(() => checkBulkOptions('Email "news"', { bulk: true, topic: 'weekly-news_2' })).not.toThrow()
    expect(() => checkBulkOptions('Email "reset"', {})).not.toThrow()
  })

  it('take plain recipients separated by commas, lower-cased and each once', () => {
    expect(bulkRecipients(' Ada@Example.com ')).toEqual(['ada@example.com'])
    expect(bulkRecipients('ada@example.com, Bo@example.com,ada@EXAMPLE.com')).toEqual(['ada@example.com', 'bo@example.com'])
    for (const to of ['Ada <ada@example.com>', 'ada@example.com;bo@example.com', 'ada', 'ada@example.com,']) expect(() => bulkRecipients(to)).toThrow(/plain addresses/)
  })

  it('refuse bulk mail at a transport the unsubscribe did not see', () => {
    expect(() => refuseUnlinkedBulk(true)).toThrow(/job's mail/)
    expect(() => refuseUnlinkedBulk(undefined)).not.toThrow()
  })
})
