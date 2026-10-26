import type { BetterAuthPlugin } from 'better-auth'

// The user table can be one another system made, such as Supabase's `auth.users`: the app names it and its columns,
// and every model and plugin of the store reads them through `userTable`. Better Auth's own field names stay in the
// code; only the table's and columns' names in the database change.

/** Each column of the user table, by the name Protobase gives it, with Better Auth's field it holds. */
const userFields = {
  name: 'name',
  email: 'email',
  email_verified: 'emailVerified',
  email_confirmed_at: 'emailConfirmedAt',
  image: 'image',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  role: 'role',
  banned: 'banned',
  ban_reason: 'banReason',
  ban_expires: 'banExpires',
  two_factor_enabled: 'twoFactorEnabled',
  last_role: 'lastRole',
  last_organization_id: 'lastOrganizationId',
} as const

export type UserColumn = keyof typeof userFields

export type UserTableOptions = {
  /** The table's name, default `user`, for example `users` for Supabase's `auth.users`. */
  table?: string
  /**
   * The columns named otherwise than Protobase names them: `{ role: 'app_role' }`, where `role` holds something else
   * already, such as the Postgres role in Supabase's `auth.users`.
   */
  columns?: Partial<Record<UserColumn, string>>
  /** A JSON column that holds each user's metadata, such as `raw_user_meta_data`; none by default. */
  metadata?: string
}

/** The user table's names, from `auth.users` option; unknown columns are an error. */
export const userTable = ({ table = 'user', columns = {}, metadata }: UserTableOptions = {}) => {
  const unknown = Object.keys(columns).find((name) => !(name in userFields))
  if (unknown !== undefined) throw new Error(`users.columns names "${unknown}", which is not a column of the user table: ${Object.keys(userFields).join(', ')}`)
  const column = (name: UserColumn) => columns[name] ?? name
  const fieldNames = Object.fromEntries(Object.entries(userFields).map(([name, field]) => [field, column(name as UserColumn)])) as Record<string, string>
  return { modelName: table, column, fieldNames, metadata }
}

export type UserTable = ReturnType<typeof userTable>

/** Better Auth's `user` option: the table and its core columns. */
export const userModel = ({ modelName, column }: UserTable) => ({
  modelName,
  fields: { name: column('name'), email: column('email'), emailVerified: column('email_verified'), image: column('image'), createdAt: column('created_at'), updatedAt: column('updated_at') },
})

/** Each user field the user metadata column adds; none without one. */
export const metadataField = ({ metadata }: UserTable) => (metadata ? { metadata: { type: 'json', required: false, fieldName: metadata } } as const : undefined)

type Fields = Record<string, { fieldName?: string }>

/** The fields, each with its column named as the app names it. */
export const userFieldsNamed = <F extends Fields>(fields: F, { fieldNames }: UserTable): F =>
  Object.fromEntries(Object.entries(fields).map(([field, attribute]) => [field, { ...attribute, fieldName: fieldNames[field] ?? attribute.fieldName }])) as F

/** The plugin, with the columns it adds to the user table named as the app names them. */
export const withUserColumns = <P extends BetterAuthPlugin>(plugin: P, table: UserTable): P => {
  const user = plugin.schema?.user
  if (!user) return plugin
  return { ...plugin, schema: { ...plugin.schema, user: { ...user, fields: userFieldsNamed(user.fields, table) } } }
}
