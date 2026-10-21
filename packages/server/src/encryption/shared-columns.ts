import type { FieldModel, ResourceModel } from '@protobase/schema'

const sameTable = (a: ResourceModel, b: ResourceModel) =>
  a.table.name === b.table.name && (a.table.schema === undefined || b.table.schema === undefined || a.table.schema === b.table.schema)

const columnOf = (model: ResourceModel, name: string | undefined) => (name === undefined ? null : model.fields[name]?.column ?? name)

// Values bind to the table as declared, the tenant and the key, so a second resource opens them only if it binds alike.
const bindsAlike = (a: ResourceModel, b: ResourceModel) =>
  (a.table.schema ?? null) === (b.table.schema ?? null) &&
  columnOf(a, a.tenant) === columnOf(b, b.tenant) &&
  JSON.stringify(a.primaryKey.map((name) => columnOf(a, name))) === JSON.stringify(b.primaryKey.map((name) => columnOf(b, name)))

// A field writes a column as its own, or as a part of the key of the record a relation points at.
const isOver = (field: FieldModel, column: string) => field.column === column || (field.relation?.columns.includes(column) ?? false)

// Any other field of the encrypted field's own resource over its column would write it unencrypted.
const ownProblems = (model: ResourceModel, field: FieldModel) =>
  Object.values(model.fields)
    .filter((other) => other !== field && isOver(other, field.column))
    .map((other) => `${model.name}.${other.name} is over ${model.table.name}.${field.column}, which ${model.name}.${field.name} encrypts: leave the column out of it`)

/**
 * Every other field over the column of an encrypted field that would write plaintext into it or bind its values
 * differently: in its own resource, any; in another resource, one that is not `.encrypted()` too over the same
 * `.table()`, tenant and key.
 */
export const sharedColumnProblems = (models: readonly ResourceModel[]) =>
  models.flatMap((model) =>
    Object.values(model.fields)
      .filter((field) => field.encrypted)
      .flatMap((field) => [
        ...ownProblems(model, field),
        ...models
          .filter((other) => other !== model && sameTable(model, other))
          .flatMap((other) => {
            const shared = Object.values(other.fields).find((candidate) => isOver(candidate, field.column))
            if (!shared || (shared.encrypted && shared.column === field.column && bindsAlike(model, other))) return []
            return [`${other.name}.${shared.name} is over ${model.table.name}.${field.column}, which ${model.name} encrypts: declare it .encrypted() too, with the same table, tenant and key, or leave the column out`]
          }),
      ]),
  )
