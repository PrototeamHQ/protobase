import type { ResourceModel } from '@protobase/schema'

const sameTable = (a: ResourceModel, b: ResourceModel) =>
  a.table.name === b.table.name && (a.table.schema === undefined || b.table.schema === undefined || a.table.schema === b.table.schema)

const columnOf = (model: ResourceModel, name: string | undefined) => (name === undefined ? null : model.fields[name]?.column ?? name)

// Values bind to the table as declared, the tenant and the key, so a second resource opens them only if it binds alike.
const bindsAlike = (a: ResourceModel, b: ResourceModel) =>
  (a.table.schema ?? null) === (b.table.schema ?? null) &&
  columnOf(a, a.tenant) === columnOf(b, b.tenant) &&
  JSON.stringify(a.primaryKey.map((name) => columnOf(a, name))) === JSON.stringify(b.primaryKey.map((name) => columnOf(b, name)))

/**
 * Every field of another resource over the column of an encrypted field that would write plaintext into it or bind its
 * values differently: it must be `.encrypted()` too, over the same `.table()`, tenant and key, or leave the column out.
 */
export const sharedColumnProblems = (models: readonly ResourceModel[]) =>
  models.flatMap((model) =>
    Object.values(model.fields)
      .filter((field) => field.encrypted)
      .flatMap((field) =>
        models
          .filter((other) => other !== model && sameTable(model, other))
          .flatMap((other) => {
            const shared = Object.values(other.fields).find((candidate) => candidate.column === field.column)
            if (!shared || (shared.encrypted && bindsAlike(model, other))) return []
            return [`${other.name}.${shared.name} is over ${model.table.name}.${field.column}, which ${model.name} encrypts: declare it .encrypted() too, with the same table, tenant and key, or leave the column out`]
          }),
      ),
  )
