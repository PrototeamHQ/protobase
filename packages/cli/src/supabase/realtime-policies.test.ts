import { describe, expect, it } from 'vitest'
import { realtimeMigration, type RealtimePolicy } from './realtime-policies'

const policy = (overrides: Partial<RealtimePolicy>): RealtimePolicy => ({ name: 'p', permissive: true, roles: ['authenticated'], command: 'SELECT', using: null, withCheck: null, ...overrides })

describe('realtimeMigration', () => {
  it('makes realtime.messages and realtime.topic(), then each policy as the source has it', () => {
    const text = realtimeMigration([
      policy({ name: 'members "hear"', using: "(realtime.topic() = 'room'::text)" }),
      policy({ name: 'send', permissive: false, roles: ['anon', 'public'], command: 'INSERT', withCheck: '(extension = \'broadcast\'::text)' }),
    ])
    expect(text).toContain('create table realtime.messages (')
    expect(text).toContain('create function realtime.topic() returns text')
    expect(text).toContain('alter table realtime.messages enable row level security;')
    expect(text).toContain(`create policy "members ""hear""" on realtime.messages as permissive for SELECT to "authenticated" using ((realtime.topic() = 'room'::text));\n`)
    expect(text).toContain(`create policy "send" on realtime.messages as restrictive for INSERT to "anon", public with check ((extension = 'broadcast'::text));\n`)
  })

  it('leaves out, as a comment on one line, a policy for Supabase\'s own roles alone, and drops them from the others', () => {
    const text = realtimeMigration([policy({ name: 'admin\nall', roles: ['supabase_realtime_admin'], command: 'ALL', using: 'true' }), policy({ roles: ['postgres', 'authenticated'], using: 'true' })])
    expect(text).toContain('-- Left out by protobase import supabase: the policy "admin\\nall" names only Supabase\'s own roles.\n')
    expect(text).not.toContain('supabase_realtime_admin')
    expect(text).toContain('create policy "p" on realtime.messages as permissive for SELECT to "authenticated" using (true);\n')
  })
})
