import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Node } from 'ts-morph'
import type { AuthSettings } from '@protobase/server'
import { exportedConfigObject } from './config-object'

// The app's Better Auth settings, `auth` in every preset's protobase.config.ts, point at Supabase's users: the import
// and the create wizard each add the settings that say so, with a comment of their own, to its `auth`.

/** The `auth` settings for Supabase's auth.users as the user table, on a copy of the database the import owns. */
export const supabaseUsers = {
  // Supabase's `role` holds the Postgres role, so the app's roles go to a column of their own. Every table of `auth`,
  // where Supabase Auth keeps identities, sessions, refresh tokens and two-factor secrets, is the store's own.
  users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data', guardedSchemas: ['auth'] },
  passwordHashes: ['bcrypt'],
  generateUserId: 'uuid',
} satisfies Partial<AuthSettings>

/** The schema of the app's own sign-in data on a Supabase database, beside Supabase's `auth`. */
export const sharedUsersSchema = 'app_auth'

/** The `auth` settings for a view over Supabase's auth.users, on a Supabase database the app shares with Supabase Auth. */
export const supabaseUsersView = {
  schema: sharedUsersSchema,
  users: { ...supabaseUsers.users, keyTable: { schema: 'auth', table: 'users' } },
  passwordHashes: supabaseUsers.passwordHashes,
  generateUserId: supabaseUsers.generateUserId,
} satisfies Partial<AuthSettings>

/** Settings to add to the config's `auth`, with the comment above them. */
export type UsersConfig = { settings: Partial<AuthSettings>; comment: string[] }

export const importedUsersConfig: UsersConfig = {
  settings: supabaseUsers,
  comment: [
    "Supabase's own auth.users as the app's user table, written by `protobase import supabase`: every foreign key,",
    'trigger and policy naming it keeps working. Its passwords are bcrypt hashes, its ids UUIDs, and its `role` the',
    "Postgres role, so the app's roles go to a column of their own. No resource may be over a table of auth, where",
    'Supabase Auth keeps its sessions, tokens and secrets, and the assistant never reads one.',
  ],
}

export const sharedUsersConfig: UsersConfig = {
  settings: supabaseUsersView,
  comment: [
    `Supabase's users, read through the view ${sharedUsersSchema}.users over auth.users, written by \`create protobase\`: the app`,
    `keeps only its own sign-in data, in ${sharedUsersSchema}, and Supabase's auth schema stays as Supabase set it up. Their`,
    "passwords are bcrypt hashes, their ids UUIDs, and `role` in auth.users the Postgres role, so the app's roles go to a",
    'column of their own. No resource may be over a table of auth, where Supabase Auth keeps its sessions, tokens and',
    'secrets, and the assistant never reads one.',
  ],
}

// The settings as TypeScript: strings, arrays and plain objects are all they hold.
const literal = (value: unknown): string => {
  if (typeof value === 'string') return `'${value}'`
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`
  if (typeof value === 'object' && value !== null) return `{ ${Object.entries(value).map(([key, item]) => `${key}: ${literal(item)}`).join(', ')} }`
  throw new Error(`Not implemented: a setting of type ${typeof value}`)
}

const settingsText = ({ settings, comment }: UsersConfig, indent: string) =>
  [...comment.map((line) => `// ${line}`), ...Object.entries(settings).map(([key, value]) => `${key}: ${literal(value)},`)].map((line) => `${indent}${line}`).join('\n')

/**
 * protobase.config.ts with the settings first in its `auth`, or with an `auth` of them when it has none, sign-in being
 * on by default; fails, naming what to add, when it exports no object the import can see or its `auth` is not one.
 */
export const withSupabaseUsers = (text: string, file: string, users: UsersConfig) => {
  const config = exportedConfigObject(text).object
  const refused = () =>
    new Error(`${file} must export a config with an \`auth: { ... }\` object: point it at Supabase's auth.users yourself with ${JSON.stringify(users.settings)}, then try again`)
  if (!config) throw refused()
  const auth = config.getProperty('auth')
  if (!auth) {
    const last = config.getProperties().at(-1)
    if (!last) return `${text.slice(0, config.getStart())}{ auth: ${literal(users.settings)} }${text.slice(config.getEnd())}`
    return `${text.slice(0, last.getEnd())}, auth: ${literal(users.settings)}${text.slice(last.getEnd())}`
  }
  const object = Node.isPropertyAssignment(auth) ? auth.getInitializer() : undefined
  if (!object || !Node.isObjectLiteralExpression(object)) throw refused()
  const first = object.getProperties()[0]
  const indent = first ? ' '.repeat(first.getStartLinePos() === first.getStart() ? 0 : first.getStart() - first.getStartLinePos()) : '  '
  const at = object.getStart() + 1
  return `${text.slice(0, at)}\n${settingsText(users, indent)}${first ? '' : '\n'}${text.slice(at)}`
}

/** Where the app's Better Auth settings live, and what they become; fails before anything is written when it cannot. */
export const planAuthConfig = async (projectDir: string, users: UsersConfig) => {
  const file = path.join(projectDir, 'protobase.config.ts')
  if (!existsSync(file)) throw new Error('The project has no protobase.config.ts with its `auth`: start from a project made by create-protobase')
  const text = withSupabaseUsers(await readFile(file, 'utf8'), path.relative(projectDir, file), users)
  return { file, write: () => writeFile(file, text) }
}
