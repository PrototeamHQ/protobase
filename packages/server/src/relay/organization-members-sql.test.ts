import { describe, expect, it } from 'vitest'
import { dropMemberTableSql, memberTableSql } from './organization-members-sql'

describe('memberTableSql', () => {
  const statements = memberTableSql({ table: '"auth"."member"', organization: 'organization_id', user: 'person_id' }).join(';\n')

  it('queues one job per statement from a trigger for each event, as a trigger with transition tables takes one', () => {
    expect(statements).toContain('create trigger relay_member_added after insert on "auth"."member" referencing new table as added for each statement')
    expect(statements).toContain('create trigger relay_member_moved after update on "auth"."member" referencing old table as removed new table as added for each statement')
    expect(statements).toContain('create trigger relay_member_removed after delete on "auth"."member" referencing old table as removed for each statement')
    expect(statements).toContain("perform jobs.enqueue('relay.organization-members', jsonb_build_object('members', moved))")
  })

  it('reads the columns under the names the store gives them, and an update only by the pairs it changes', () => {
    expect(statements).toContain('select "organization_id"::text as organization, "person_id"::text as "user" from added except select "organization_id"::text as organization, "person_id"::text as "user" from removed')
  })

  it('drops the triggers before the function', () => {
    expect(dropMemberTableSql('"auth"."member"').at(-1)).toBe('drop function if exists relay.organization_members_changed()')
  })
})
