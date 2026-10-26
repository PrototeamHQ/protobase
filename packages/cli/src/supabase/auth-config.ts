import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Node } from 'ts-morph'
import type { AuthSettings } from '@protobase/server'
import { exportedConfigObject } from './config-object'

// The app's Better Auth settings, `auth` in every preset's protobase.config.ts, point at Supabase's auth.users: the
// import adds the settings that say so to its `auth`.

/** The `auth` settings for Supabase's auth.users. */
export const supabaseUsers = {
  // Supabase's `role` holds the Postgres role, so the app's roles go to a column of their own.
  users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' },
  passwordHashes: ['bcrypt'],
  generateUserId: 'uuid',
} satisfies Partial<AuthSettings>

const settingsText = (indent: string) =>
  [
    "// Supabase's own auth.users as the app's user table, written by `protobase import supabase`: every foreign key,",
    '// trigger and policy naming it keeps working. Its passwords are bcrypt hashes, its ids UUIDs, and its `role` the',
    "// Postgres role, so the app's roles go to a column of their own.",
    `users: { table: '${supabaseUsers.users.table}', columns: { role: '${supabaseUsers.users.columns.role}' }, metadata: '${supabaseUsers.users.metadata}' },`,
    `passwordHashes: [${supabaseUsers.passwordHashes.map((name) => `'${name}'`).join(', ')}],`,
    `generateUserId: '${supabaseUsers.generateUserId}',`,
  ]
    .map((line) => `${indent}${line}`)
    .join('\n')

const settingsObject = `{ users: { table: '${supabaseUsers.users.table}', columns: { role: '${supabaseUsers.users.columns.role}' }, metadata: '${supabaseUsers.users.metadata}' }, passwordHashes: ['bcrypt'], generateUserId: 'uuid' }`

/**
 * protobase.config.ts with the settings first in its `auth`, or with an `auth` of them when it has none, sign-in being
 * on by default; fails, naming what to add, when it exports no object the import can see or its `auth` is not one.
 */
export const withSupabaseUsers = (text: string, file: string) => {
  const config = exportedConfigObject(text).object
  const refused = () =>
    new Error(`${file} must export a config with an \`auth: { ... }\` object: point it at Supabase's auth.users yourself with ${JSON.stringify(supabaseUsers)}, then import again`)
  if (!config) throw refused()
  const auth = config.getProperty('auth')
  if (!auth) {
    const last = config.getProperties().at(-1)
    if (!last) return `${text.slice(0, config.getStart())}{ auth: ${settingsObject} }${text.slice(config.getEnd())}`
    return `${text.slice(0, last.getEnd())}, auth: ${settingsObject}${text.slice(last.getEnd())}`
  }
  const object = Node.isPropertyAssignment(auth) ? auth.getInitializer() : undefined
  if (!object || !Node.isObjectLiteralExpression(object)) throw refused()
  const first = object.getProperties()[0]
  const indent = first ? ' '.repeat(first.getStartLinePos() === first.getStart() ? 0 : first.getStart() - first.getStartLinePos()) : '  '
  const at = object.getStart() + 1
  return `${text.slice(0, at)}\n${settingsText(indent)}${first ? '' : '\n'}${text.slice(at)}`
}

/** Where the app's Better Auth settings live, and what they become; fails before anything is written when it cannot. */
export const planAuthConfig = async (projectDir: string) => {
  const file = path.join(projectDir, 'protobase.config.ts')
  if (!existsSync(file)) throw new Error('The project has no protobase.config.ts with its `auth`: import into a project made by create-protobase')
  const text = withSupabaseUsers(await readFile(file, 'utf8'), path.relative(projectDir, file))
  return { file, write: () => writeFile(file, text) }
}
