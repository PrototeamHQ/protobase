import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CreateAuthOptions } from '@protobase/server'

// The app's Better Auth setup, `auth/auth.ts` in every preset, points at Supabase's auth.users: the import writes the
// options that say so into a module of their own, `auth/supabase-users.ts`, and spreads it into the file's
// `createAuth({ ... })`.

/** createAuth's options for Supabase's auth.users. */
export const supabaseUsers = {
  // Supabase's `role` holds the Postgres role, so the app's roles go to a column of their own.
  users: { table: 'users', columns: { role: 'app_role' }, metadata: 'raw_user_meta_data' },
  passwordHashes: ['bcrypt'],
  generateUserId: 'uuid',
} satisfies Partial<CreateAuthOptions>

const moduleText = `import type { CreateAuthOptions } from '@protobase/server'

/**
 * Supabase's own auth.users as the app's user table, written by \`protobase import supabase\`: every foreign key, trigger
 * and policy naming it keeps working. Its passwords are Supabase's bcrypt hashes, and its ids are UUIDs.
 */
export const supabaseUsers = {
  // Supabase's \`role\` holds the Postgres role, so the app's roles go to a column of their own.
  users: { table: '${supabaseUsers.users.table}', columns: { role: '${supabaseUsers.users.columns.role}' }, metadata: '${supabaseUsers.users.metadata}' },
  passwordHashes: [${supabaseUsers.passwordHashes.map((name) => `'${name}'`).join(', ')}],
  generateUserId: '${supabaseUsers.generateUserId}',
} satisfies Partial<CreateAuthOptions>
`

const call = 'createAuth({'
const importLine = "import { supabaseUsers } from './supabase-users'\n"

/**
 * `auth/auth.ts` with the options spread into its one `createAuth({` call, and their import first; fails, naming what
 * to add, otherwise.
 */
export const withSupabaseUsers = (text: string, file: string) => {
  const calls = text.split(call).length - 1
  if (calls !== 1) {
    throw new Error(`${file} must call \`createAuth({\` once, it does ${calls} times: point it at Supabase's auth.users yourself with ${JSON.stringify(supabaseUsers)}, then import again`)
  }
  return `${importLine}${text.replace(call, `${call}\n  ...supabaseUsers,`)}`
}

/** Where the app's Better Auth setup lives, and what it becomes; fails before anything is written when it cannot. */
export const planAuthConfig = async (projectDir: string) => {
  const file = path.join(projectDir, 'auth', 'auth.ts')
  if (!existsSync(file)) throw new Error(`The project has no auth/auth.ts with its createAuth: import into a project made by create-protobase`)
  const text = withSupabaseUsers(await readFile(file, 'utf8'), path.relative(projectDir, file))
  return {
    file,
    write: async () => {
      await writeFile(path.join(path.dirname(file), 'supabase-users.ts'), moduleText, { flag: 'wx' })
      await writeFile(file, text)
    },
  }
}
