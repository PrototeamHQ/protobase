import { describe, expect, it } from 'vitest'
import { sharedUsersMigration } from './shared-users-migration'

// What the migration may and may not touch; tests/supabase-auth/ runs it on Supabase's own database.

const sql = sharedUsersMigration()
const view = sql.slice(sql.indexOf('create view'), sql.indexOf('create function'))
const trigger = sql.slice(sql.indexOf('create function'), sql.indexOf('create trigger'))
const secrets = ['encrypted_password', 'confirmation_token', 'recovery_token', 'email_change_token_current', 'email_change_token_new', 'reauthentication_token', 'phone_change_token', 'raw_app_meta_data', 'is_super_admin']

describe('the migration of Supabase users on a database the app shares', () => {
  it('creates, alters and drops nothing in auth', () => {
    expect(sql).not.toMatch(/\b(create|alter|drop) (table|view|function|trigger|index|schema|policy) (if (not )?exists )?"?auth"?\./i)
    expect(sql).not.toMatch(/\bcreate (trigger|index|policy) [^;]* on "?auth"?\./i)
    expect(sql).toMatch(/create trigger users_write instead of insert or update or delete on app_auth\.users/)
  })

  it('reads no secret column of auth.users into the view', () => {
    for (const column of secrets) expect(view).not.toContain(column)
    expect(view).toContain('with (security_invoker = on)')
  })

  it('writes Supabase-owned columns only with constants, and never upserts auth.users', () => {
    expect(trigger).toContain("'{\"provider\":\"email\",\"providers\":[\"email\"]}'")
    expect(trigger).not.toMatch(/insert into auth\.users[^;]*on conflict/)
    expect(trigger).not.toMatch(/raw_app_meta_data = |is_super_admin|is_sso_user/)
    expect(trigger).toContain("security invoker set search_path = ''")
  })
})
