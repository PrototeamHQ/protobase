import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { splitDump } from '../../../packages/cli/src/supabase/statements'
import { databaseUrl, supabaseServerUrl } from '../../../scripts/test-db/templates'
import { alice, bob, bucket, fileName } from './users'

const fixtures = path.join(import.meta.dirname, '../../../packages/cli/tests/supabase/fixtures')

// Supabase Auth's and Storage's schemas, as their services migrate them on Supabase's Postgres image: the schema dump
// of fixtures/supabase-schema.sql without the app it was taken with, and without the grants to the services' own roles,
// which Supabase's init makes and the tests' server, initialised as a Protobase Cloud instance is, has not.
const platformSchemas = () =>
  splitDump(readFileSync(path.join(fixtures, 'supabase-schema.sql'), 'utf8'))
    .filter((piece) => piece.kind === 'statement')
    .filter((piece) => !/\b(public|billing)\.|SCHEMA (public|billing)\b/.test(piece.text))
    .filter((piece) => !/\b(dashboard_user|supabase_auth_admin|supabase_storage_admin)\b/.test(piece.text))
    .map((piece) => piece.text)
    .join('\n')

// alice and bob as Supabase Auth stored them, with their bcrypt passwords and email identities.
const users = () =>
  readFileSync(path.join(fixtures, 'gotrue-users.sql'), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('INSERT') && (line.includes(alice.id) || line.includes(bob.id)))
    .join('\n')

/** Each user's file as Storage recorded it: its size, and its MD5 as the ETag. */
const storedObject = (user: typeof alice) => ({
  name: fileName(user),
  owner: user.id,
  metadata: { eTag: `"${createHash('md5').update(user.file).digest('hex')}"`, size: Buffer.byteLength(user.file), mimetype: 'text/plain', cacheControl: 'max-age=3600' },
})

/**
 * The sample Supabase project (source.sql) in a database of its own on Supabase's Postgres image, made by its superuser
 * supabase_admin, which the import then reads it as. `dispose` drops it.
 */
export const createSourceDatabase = async () => {
  const name = `supabase_move_source_${randomBytes(4).toString('hex')}`
  const server = postgres(supabaseServerUrl, { max: 1, onnotice: () => {} })
  await server.unsafe(`create database ${name}`)
  const url = databaseUrl(name, supabaseServerUrl)
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  await sql.unsafe(platformSchemas())
  await sql.unsafe(users())
  await sql.unsafe(readFileSync(path.join(import.meta.dirname, 'source.sql'), 'utf8'))
  for (const object of [storedObject(alice), storedObject(bob)]) {
    await sql`insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values (${bucket}, ${object.name}, ${object.owner}, ${object.owner}, ${sql.json(object.metadata)})`
  }
  await sql.end()

  const dispose = async () => {
    await server.unsafe(`drop database if exists ${name} with (force)`)
    await server.end()
  }
  return { url, dispose }
}
