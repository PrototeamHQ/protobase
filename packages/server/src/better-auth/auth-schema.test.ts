import { describe, expect, it } from 'vitest'
import { skipExisting } from './auth-schema'

describe('skipExisting', () => {
  it('makes every table, column and index skip one that exists', () => {
    const sql = `${[
      'create schema if not exists "auth"',
      'create table "auth"."user" ("id" text not null primary key, "createdAt" timestamptz default CURRENT_TIMESTAMP not null)',
      `alter table "auth"."signInPolicy" add column "platformSignIn" text default 'allowed' not null`,
      'create index "session_userId_idx" on "auth"."session" ("userId")',
      'create unique index "passkey_credentialID_idx" on "auth"."passkey" ("credentialID")',
    ].join(';\n\n')};`
    expect(skipExisting(sql).split(';\n\n')).toEqual([
      'create schema if not exists "auth"',
      'create table if not exists "auth"."user" ("id" text not null primary key, "createdAt" timestamptz default CURRENT_TIMESTAMP not null)',
      `alter table "auth"."signInPolicy" add column if not exists "platformSignIn" text default 'allowed' not null`,
      'create index if not exists "session_userId_idx" on "auth"."session" ("userId")',
      'create unique index if not exists "passkey_credentialID_idx" on "auth"."passkey" ("credentialID");',
    ])
  })

  it('leaves statements that skip already as they are', () => {
    const sql = 'create table if not exists "a" ("id" text);\n\ncreate index if not exists "a_idx" on "a" ("id");'
    expect(skipExisting(sql)).toBe(sql)
  })
})
