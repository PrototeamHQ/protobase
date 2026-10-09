import type { FieldModel, ResourceModel } from '@protobase/schema'

const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}): FieldModel => ({
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

const model = (name: string, fields: FieldModel[], extra: Partial<ResourceModel> = {}): ResourceModel => ({
  name,
  table: { name },
  primaryKey: ['id'],
  fields: Object.fromEntries(fields.map((entry) => [entry.name, entry])),
  ...extra,
})

/** A small billing domain for layout tests: subscriptions point at plans, payment methods and invoices stand alone. */
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
  invoices: model('invoices', [field('id', 'integer', { readOnly: true }), field('number', 'text'), field('status', 'enum', { enumValues: ['open', 'paid'] }), field('total', 'decimal', { readOnly: true })]),
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
