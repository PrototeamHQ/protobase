import type { FieldModel, ResourceModel } from '@protobase/schema'

export const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}): FieldModel => ({
  name,
  column: name,
  type,
  nullable: false,
  readOnly: false,
  filterable: true,
  sortable: true,
  aliases: [],
  ...extra,
})

export const model = (name: string, fields: FieldModel[], extra: Partial<ResourceModel> = {}): ResourceModel => ({
  name,
  table: { name },
  primaryKey: ['id'],
  fields: Object.fromEntries(fields.map((entry) => [entry.name, entry])),
  ...extra,
})

/** A small billing domain for layout tests: subscriptions point at plans, payment methods and invoices stand alone, messages are a conversation between people, and tool calls are what an assistant in it called. */
export const models: Record<string, ResourceModel> = {
  plans: model('plans', [field('id', 'integer', { readOnly: true }), field('name', 'text'), field('seats', 'integer')]),
  subscriptions: model('subscriptions', [
    field('id', 'integer', { readOnly: true }),
    field('plan', 'relation', { relation: { resource: 'plans', columns: ['plan_id'] } }),
    field('status', 'enum', { enumValues: ['active', 'canceled'] }),
    field('seatsUsed', 'integer'),
    field('organizationId', 'integer'),
  ], { tenant: 'organizationId' }),
  paymentMethods: model('paymentMethods', [field('id', 'integer', { readOnly: true }), field('brand', 'text'), field('last4', 'text'), field('isDefault', 'boolean')]),
  people: model('people', [field('id', 'integer', { readOnly: true }), field('name', 'text')]),
  messages: model('messages', [
    field('id', 'integer', { readOnly: true }),
    field('author', 'relation', { readOnly: true, relation: { resource: 'people', columns: ['author_id'] } }),
    field('sentAt', 'timestamp', { readOnly: true }),
    field('sentOn', 'date', { sortable: false }),
    field('body', 'text'),
    field('room', 'text'),
    field('pinned', 'boolean'),
    field('organizationId', 'integer'),
  ], { author: 'author', tenant: 'organizationId' }),
  toolCalls: model('toolCalls', [
    field('id', 'integer', { readOnly: true }),
    field('tool', 'text'),
    field('calledAt', 'timestamp'),
    field('state', 'enum', { enumValues: ['done', 'error', 'running'] }),
    field('input', 'json'),
    field('output', 'json'),
    field('failure', 'text'),
    field('room', 'text'),
  ]),
  invoices: model('invoices', [field('id', 'integer', { readOnly: true }), field('number', 'text'), field('status', 'enum', { enumValues: ['open', 'paid'] }), field('total', 'decimal', { readOnly: true }), field('issuedOn', 'date'), field('memo', 'text', { filterable: false })]),
}

/** The same models with some fields gone and others read-only, as `restrictModel` gives them to a caller. */
export const restricted = (hide: Record<string, string[]>, readOnly: Record<string, string[]> = {}, drop: string[] = []) =>
  Object.fromEntries(
    Object.entries(models)
      .filter(([name]) => !drop.includes(name))
      .map(([name, entry]) => [
        name,
        {
          ...entry,
          fields: Object.fromEntries(
            Object.entries(entry.fields)
              .filter(([fieldName]) => !(hide[name] ?? []).includes(fieldName))
              .map(([fieldName, value]) => [fieldName, (readOnly[name] ?? []).includes(fieldName) ? { ...value, readOnly: true } : value]),
          ),
        },
      ]),
  )

/** A task with claims, each claim with steps: three records deep, for the scope stack's tests. */
export const nested: Record<string, ResourceModel> = {
  tasks: model('tasks', [field('id', 'integer', { readOnly: true }), field('title', 'text'), field('status', 'text')]),
  task_claims: model('task_claims', [
    field('id', 'integer', { readOnly: true }),
    field('task_id', 'integer'),
    field('claimed_at', 'timestamp'),
    field('status', 'text'),
    field('worker', 'relation', { relation: { resource: 'workers', columns: ['worker_id'] } }),
    field('meta', 'json'),
  ]),
  claim_steps: model('claim_steps', [field('id', 'integer', { readOnly: true }), field('claim_id', 'integer'), field('name', 'text')]),
  workers: model('workers', [field('id', 'integer', { readOnly: true }), field('name', 'text')]),
}
