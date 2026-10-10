import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { f, resource, type FileProcessor } from '@protobase/schema'
import { createAdmin, createFileCleanup, localFiles, type FilesOptions } from '@protobase/server'
import { createEmptyPg } from '../../../../test-support/pglite-snapshot'
import { testAuthenticator } from '../../../../test-support/server'

export type ProductOptions = { derive?: Record<string, FileProcessor>; accept?: string[] }

export const products = ({ derive = {}, accept = ['image/*'] }: ProductOptions = {}) =>
  resource('products')
    .table('products')
    .fields({
      id: f.integer().readOnly().dbDefault(),
      organizationId: f.relation('organizations'),
      name: f.text(),
      image: f.file().accept(accept).maxSize('64 KB').optional().derive(derive),
      imageWidth: f.integer().readOnly().optional(),
      imageRatio: f.decimal({ precision: 8, scale: 4 }).readOnly().optional(),
      datasheet: f.file().accept(['application/pdf']).optional(),
      deletedAt: f.timestamp().readOnly().optional(),
    })
    .primaryKey((r) => r.id)
    .tenant((r) => r.organizationId)
    .softDelete((r) => r.deletedAt)

/** No tenant and no soft delete: deleting a row removes it. */
export const avatars = resource('avatars')
  .table('avatars')
  .fields({ id: f.integer().readOnly().dbDefault(), name: f.text(), picture: f.file().accept(['image/*']).public().optional() })
  .primaryKey((r) => r.id)

const ddl = `
create table products (
  id integer generated always as identity primary key, organization_id integer not null, name text not null,
  image text, image_width integer, image_ratio numeric(8,4), datasheet text, deleted_at timestamptz
);
create table avatars (id integer generated always as identity primary key, name text not null, picture text);
`

/** An admin with products and avatars over PGlite, keeping files in a fresh temp folder. */
export const createFilesFixture = async (options: ProductOptions = {}) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-files-'))
  const pg = await createEmptyPg()
  await pg.exec(ddl)
  const db = new Kysely<any>({ dialect: new PGliteDialect(pg) })
  const files: FilesOptions = {
    providers: { private: localFiles({ dir: path.join(dir, 'private') }), public: localFiles({ dir: path.join(dir, 'public'), public: true }) },
    secret: 'files-test-secret',
  }
  const resources = [products(options), avatars]
  const app = createAdmin({ resources, db, authenticate: testAuthenticator, files })
  const cleanup = createFileCleanup({ resources, db, files })!
  // Every object a provider holds, scheduled deletes left out
  const stored = async (provider: 'private' | 'public') => {
    const names = await readdir(path.join(dir, provider), { recursive: true }).catch(() => [] as string[])
    return names.filter((name) => /\.[a-z0-9]+$/.test(name) && !name.startsWith('.')).map((name) => name.split(path.sep).join('/')).sort()
  }
  const scheduled = async (provider: 'private' | 'public') => (await files.providers![provider]!.store.list('.cleanup/')).length
  return { app, db, pg, files, cleanup, stored, scheduled, close: async () => { await db.destroy(); await rm(dir, { recursive: true, force: true }) } }
}
