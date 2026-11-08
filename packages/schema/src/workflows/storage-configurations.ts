import type { FieldAccess } from '../access/types'
import { f } from '../fields'
import { layout as l } from '../layout'
import { resource } from '../resource'
import { view } from '../view'

export const storageKinds = ['local', 's3'] as const

/** A configuration's name, which a workflow's storage steps name it by. */
export const storageNamePattern = /^[a-z][a-z0-9_]{0,62}$/

// Read by no one, not even the role that sets them: the server opens them only to build the store a step names. A field
// no one reads is written only through its own rule, so it names the grant to create or change a configuration.
const writeOnly: FieldAccess = {
  read: () => false,
  create: (ctx) => ctx.holds?.('storage_configurations.create') ?? false,
  update: (ctx) => ctx.holds?.('storage_configurations.update') ?? false,
}

/**
 * A named place a workflow stores files in: a folder under the operator's storage root, or an S3-compatible bucket. A
 * workflow names it, so changing where it points leaves the workflows unchanged. Reading one lets a workflow's author
 * use it; creating, changing and deleting are grants of their own.
 */
const storageConfigurationsResource = (schema: string) =>
  resource('storage_configurations')
    .table(`${schema}.storage_configurations`)
    .fields({
      id: f.uuid().readOnly().dbDefault(),
      name: f.text().regex(storageNamePattern, 'a lowercase letter, then lowercase letters, digits and "_", at most 63').filterable().sortable(),
      kind: f.enum(storageKinds),
      dir: f.text().optional().max(1024),
      bucket: f.text().optional().max(63),
      region: f.text().optional().max(32),
      endpoint: f.text().optional().max(255),
      access_key_id: f.text().optional().encrypted().access(writeOnly),
      secret_access_key: f.text().optional().encrypted().access(writeOnly),
      tenant_id: f.text().optional().readOnly(),
      created_at: f.timestamp().readOnly().dbDefault(),
      updated_at: f.timestamp().readOnly().dbDefault().sortable(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.tenant_id)
    .etagFrom((r) => r.updated_at)
    .search((r) => [r.name])
    .explicitGrants()

const storageConfigurationsView = view<ReturnType<typeof storageConfigurationsResource>>('storage_configurations')
  .names({ singular: 'Storage configuration', plural: 'Storage configurations' })
  .icon('archive')
  .nav({ hidden: true })
  .title((r) => r.name)
  .help('Where workflows store files, by name: a folder under the storage root the app sets, or an S3-compatible bucket. Changing where it points leaves the workflows that name it unchanged; the files already stored stay where they are.')
  .fields((r) => ({
    name: r.name.label('Name').help('The name a workflow\'s storage steps give, such as "archive"'),
    kind: r.kind.label('Kind').valueLabels({ local: 'Local folder', s3: 'S3-compatible bucket' }),
    dir: r.dir.label('Folder').help('For a local folder: a path inside the storage root, such as "invoices/2026"'),
    bucket: r.bucket.label('Bucket').help('For a bucket: its name'),
    region: r.region.label('Region').help('For a bucket: its region, such as "eu-west-1"'),
    endpoint: r.endpoint.label('Endpoint').help('For a bucket: its https address, one of those the app allows'),
    created_at: r.created_at.label('Created'),
    updated_at: r.updated_at.label('Updated'),
  }))
  .list((r) => ({ columns: [r.name, r.kind, r.dir, r.bucket, r.updated_at], sort: [[r.name, 'asc']] }))
  .layout((r) => [
    l.section('Storage configuration', [r.name, r.kind, r.dir, r.bucket, r.region, r.endpoint]),
    l.sidebar([r.created_at, r.updated_at]),
  ])

/** The storage configurations of the workflows over `schema`, offered when the app turns workflow storage on. */
export const storageConfigurationResources = (schema: string) => ({
  storageConfigurations: storageConfigurationsResource(schema),
  storageConfigurationsView,
})
