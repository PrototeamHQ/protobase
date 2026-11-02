import { describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import { commentsTableSql } from './comments/comments-sql'
import { commentsResource } from './comments/record-comments'
import { activityResource } from './history/activity'
import { historyTableSql } from './history/history-sql'
import { configExports } from './resource-source'
import { deliveryLogIndexesSql, subscriptionsIndexesSql } from './webhooks/table/schema-sql'
import { webhooksModule } from './webhooks/table/webhooks-module'

// The first column of each b-tree index, and the columns of each pg_trgm one, as the SQL creates them.
const leading = (text: string) => [...text.matchAll(/create index if not exists "\w+" on \S+ \("(\w+)"/g)].map((match) => match[1])
const trigram = (text: string) => [...text.matchAll(/using gin \("(\w+)" gin_trgm_ops\)/g)].map((match) => match[1])

// The columns a caller may filter or sort by alone, each needing an index that leads with it; the key is the primary key's.
const readAlone = (model: ResourceModel) =>
  Object.values(model.fields).filter((field) => (field.filterable || field.sortable) && !model.primaryKey.includes(field.name)).map((field) => field.column)

const webhooks = configExports(webhooksModule({ deliveryLog: true })).resources.map((resource) => resource.toModel())

describe('the SQL of the resources Protobase adds', () => {
  it('indexes every column the webhook subscriptions are filtered, sorted, searched and owned by', () => {
    const subscriptions = webhooks.find((model) => model.name === 'webhook_subscriptions')!
    const text = subscriptionsIndexesSql('webhooks')
    expect(readAlone(subscriptions).filter((column) => !leading(text).includes(column))).toEqual([])
    expect([subscriptions.owner, subscriptions.tenant].filter((column) => !leading(text).includes(column!))).toEqual([])
    expect(subscriptions.search!.filter((column) => !trigram(text).includes(column))).toEqual([])
    expect(text).toContain('create extension if not exists pg_trgm')
  })

  it('indexes every column the delivery log, Activity and Comments are filtered or sorted by', () => {
    const log = webhooks.find((model) => model.name === 'webhook_delivery_log')!
    const history = activityResource('changes', { tenant: true }).toModel()
    const comments = commentsResource({ tenant: true }).toModel()
    for (const [model, text] of [[log, deliveryLogIndexesSql('webhooks')], [history, historyTableSql('changes')], [comments, commentsTableSql()]] as const) {
      expect(readAlone(model).filter((column) => !leading(text).includes(column)), model.name).toEqual([])
    }
  })
})
