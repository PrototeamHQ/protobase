import { describe, expect, it } from 'vitest'
import { skipExisting } from './auth-schema'

describe('skipExisting', () => {
  it('makes every table, column and index skip one that exists', () => {
    const sql = `${[
      'create schema if not exists "auth"',
      'create table "auth"."user" ("id" text not null primary key, "created_at" timestamptz default CURRENT_TIMESTAMP not null)',
      `alter table "auth"."sign_in_policy" add column "platform_sign_in" text default 'allowed' not null`,
      'create index "session_user_id_idx" on "auth"."session" ("user_id")',
      'create unique index "passkey_credential_id_idx" on "auth"."passkey" ("credential_id")',
    ].join(';\n\n')};`
    expect(skipExisting(sql).split(';\n\n')).toEqual([
      'create schema if not exists "auth"',
      'create table if not exists "auth"."user" ("id" text not null primary key, "created_at" timestamptz default CURRENT_TIMESTAMP not null)',
      `alter table "auth"."sign_in_policy" add column if not exists "platform_sign_in" text default 'allowed' not null`,
      'create index if not exists "session_user_id_idx" on "auth"."session" ("user_id")',
      'create unique index if not exists "passkey_credential_id_idx" on "auth"."passkey" ("credential_id");',
    ])
  })

  it('leaves statements that skip already as they are', () => {
    const sql = 'create table if not exists "a" ("id" text);\n\ncreate index if not exists "a_idx" on "a" ("id");'
    expect(skipExisting(sql)).toBe(sql)
  })
})
