import { describe, expect, it } from 'vitest'
import { bulkRecipient, checkBulkOptions, refuseUnlinkedBulk } from './bulk-options'

describe('bulk options', () => {
  it('need a topic that is a plain name', () => {
    expect(() => checkBulkOptions('Email "news"', { bulk: true })).toThrow('Email "news" is bulk mail without a topic')
    expect(() => checkBulkOptions('Email "news"', { bulk: true, topic: 'Weekly News' })).toThrow(/lowercase letter/)
    expect(() => checkBulkOptions('Email "news"', { bulk: true, topic: 'weekly-news_2' })).not.toThrow()
    expect(() => checkBulkOptions('Email "reset"', {})).not.toThrow()
  })

  it('take one plain recipient, lower-cased', () => {
    expect(bulkRecipient(' Ada@Example.com ')).toBe('ada@example.com')
    for (const to of ['Ada <ada@example.com>', 'ada@example.com, bo@example.com', 'ada@example.com;bo@example.com', 'ada']) expect(() => bulkRecipient(to)).toThrow(/one plain address/)
  })

  it('refuse bulk mail at a transport the unsubscribe did not see', () => {
    expect(() => refuseUnlinkedBulk(true)).toThrow(/job's mail/)
    expect(() => refuseUnlinkedBulk(undefined)).not.toThrow()
  })
})
