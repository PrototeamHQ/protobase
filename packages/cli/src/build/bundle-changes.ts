import type { ResourceModel } from '@protobase/schema'

/**
 * One resource as the change stream maps its table's rows: the table, its schema `null` when the search path decides,
 * and as column names, its key in order, the column separating tenants (`.tenant()`) or `null`, and the columns naming
 * the person a record is one's own (`.owner()`).
 */
export type ChangeResource = { table: { schema: string | null; name: string }; key: string[]; tenant: string | null; personal: string[] }

/** The change model `protobase build` writes into the manifest: every resource of the config folder, by name. */
export type BundleChanges = { resources: Record<string, ChangeResource> }

const changeResource = (model: ResourceModel): ChangeResource => {
  const column = (field: string) => model.fields[field]!.column
  return {
    table: { schema: model.table.schema ?? null, name: model.table.name },
    key: model.primaryKey.map(column),
    tenant: model.tenant ? column(model.tenant) : null,
    personal: model.owner ? [column(model.owner)] : [],
  }
}

/** The change model of `models`, so a reader of the WAL names each changed row's resource without the app's code. */
export const bundleChanges = (models: readonly ResourceModel[]): BundleChanges => ({
  resources: Object.fromEntries(models.map((model) => [model.name, changeResource(model)])),
})
