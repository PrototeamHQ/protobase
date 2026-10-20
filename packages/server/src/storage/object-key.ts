import { invalidBucketName, invalidKey } from './storage-error'

// Supabase Storage's limits: a bucket id of up to 100 characters without `/`, an object name of up to 1024 bytes.
const bucketPattern = /^[\w!\-.*'() &$@=;:+,?]{1,100}$/
const maxNameBytes = 1024
const controlCharacters = /[\u0000-\u001f\u007f]/

/** A bucket id as Supabase Storage accepts it, else 400 `InvalidBucketName`. */
export const checkedBucketId = (id: string) => {
  if (!bucketPattern.test(id)) throw invalidBucketName()
  return id
}

/**
 * An object name as Supabase Storage accepts it: not empty, at most 1024 bytes, no control characters, no empty folder
 * and no `.` or `..` folder. Else 400 `InvalidKey`.
 */
export const checkedName = (name: string) => {
  const parts = name.split('/')
  const valid = name !== '' && new TextEncoder().encode(name).length <= maxNameBytes && !controlCharacters.test(name) && parts.every((part) => part !== '' && part !== '.' && part !== '..')
  if (!valid) throw invalidKey(name)
  return name
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * Where an object's bytes are kept in the storage provider: `storage/<sha-256 of bucket and name>/<version>`. Names may
 * hold any character, which no provider takes in a path; the hash takes every one, and the version keeps an upload apart
 * from the one it replaces until the database says which is current. A row without a version, as an import may leave
 * it, is at `unversioned`.
 */
export const objectKey = async (bucket: string, name: string, version: string | null) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([bucket, name])))
  return `storage/${hex(digest)}/${version ?? 'unversioned'}`
}
