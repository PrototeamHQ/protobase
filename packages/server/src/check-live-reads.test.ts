import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { checkLiveReads } from './check-live-reads'

const orders = resource('orders').table('orders').fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
const feed = resource('order_feed').table('order_feed').fields({ id: f.text() }).primaryKey((r) => r.id).live({ reads: ['orders'] }).toModel()
const digest = resource('feed_digest').table('feed_digest').fields({ id: f.text() }).primaryKey((r) => r.id).live({ reads: ['order_feed'] }).toModel()

describe('checkLiveReads', () => {
  it('takes reads that name resources not backed by a view', () => {
    expect(() => checkLiveReads([orders, feed])).not.toThrow()
  })

  it('refuses a read that is not a resource, or a resource that is live from others itself', () => {
    expect(() => checkLiveReads([feed])).toThrow('Resource "order_feed" is live from "orders", which is not a resource')
    expect(() => checkLiveReads([orders, feed, digest])).toThrow('Resource "feed_digest" is live from "order_feed", which is live from other resources itself')
  })
})
