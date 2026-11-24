import { describe, expect, it } from 'vitest'
import type { ModuleId } from '../../../names/modules'
import { resolveNames } from '../../../names/resolve-names'
import { userTable } from '../../../user-table'
import { ddlText } from '../../ddl'
import { renderSteps, type Had } from '../render'
import { migrationNames, type OrganizationsInput } from '../step'

const modules: ModuleId[] = ['auth', 'organizations', 'personal_access_tokens']
const organizations: OrganizationsInput = { default: { id: 'main', name: "Main's", slug: 'main' }, existingUsersRole: 'sales' }

// The parts of the step, by the module whose tables they change, over a store that has what `had` says.
const step = (had: Had, input: OrganizationsInput | undefined) => {
  const names = resolveNames({ schema: 'auth', modules })
  const parts = renderSteps(migrationNames({ schema: 'auth', names, users: userTable(), uuidIds: false }), modules, had, input).filter((part) => part.module === 'organizations' && part.step.step === 3)
  const own = parts.find((part) => part.on === undefined)
  const tokens = parts.find((part) => part.on === 'personal_access_tokens')
  return {
    statements: own?.statements.map(ddlText) ?? [],
    tokens: tokens?.statements.map(ddlText) ?? [],
    check: tokens?.check && ddlText(tokens.check),
    after: (concurrent: boolean) => tokens?.after(concurrent).map(ddlText) ?? [],
  }
}

// A store with sign-in and tokens, before organizations were ever on.
const tokensOnly: Had = (module) => module === 'auth' || module === 'personal_access_tokens'
// One where organizations were on, at their second step.
const organizationsOn: Had = (module, number) => module !== 'organizations' || number <= 2

describe('the default organization', () => {
  it('turning organizations on, is made, with every user there already its member in the configured role', () => {
    const { statements } = step(tokensOnly, organizations)
    expect(statements[0]).toMatch(/^do \$check\$/)
    expect(statements[1]).toContain(`insert into "auth"."organization" (id, "name", "slug", "created_at")\nselect cast('main' as text), 'Main''s', 'main', now()`)
    expect(statements[2]).toContain(`select cast(pg_catalog.gen_random_uuid() as text), cast('main' as text), people.id, 'member', now(), jsonb_build_array('sales')\nfrom "auth"."user" as people`)
  })

  it('turning organizations on, gives every token the default organization, in batches once the transaction commits', () => {
    const { tokens, check, after } = step(tokensOnly, organizations)
    expect(check).toBeUndefined()
    expect(tokens).toEqual([`alter table "auth"."personal_access_token" add constraint "personal_access_token_organization_id_set" check ("organization_id" is not null) not valid`])
    const [fill, required, index] = after(true)
    expect(fill).toContain(`update "auth"."personal_access_token" set "organization_id" = cast('main' as text) where id in (select id from "auth"."personal_access_token" where "organization_id" is null limit 10000);`)
    expect(fill).toContain('commit;')
    expect(required).toContain('alter table "auth"."personal_access_token" validate constraint "personal_access_token_organization_id_set";')
    expect(required).toContain('alter table "auth"."personal_access_token" alter column "organization_id" set not null;')
    expect(index).toBe('create index concurrently if not exists "personal_access_token_organization_id_user_id_idx" on "auth"."personal_access_token" ("organization_id", "user_id")')
  })

  it('in one transaction, fills the tokens with one update and builds the index plainly', () => {
    const [fill, , index] = step(tokensOnly, organizations).after(false)
    expect(fill).toBe(`update "auth"."personal_access_token" set "organization_id" = cast('main' as text) where "organization_id" is null`)
    expect(index).toBe('create index if not exists "personal_access_token_organization_id_user_id_idx" on "auth"."personal_access_token" ("organization_id", "user_id")')
  })

  it('where organizations were on, is made when missing, adds no member, and refuses a token without an organization rather than fill it', () => {
    const { statements, check, after } = step(organizationsOn, organizations)
    expect(statements).toHaveLength(2)
    expect(statements.join('\n')).not.toContain('"auth"."member"')
    expect(check).toContain('personal access tokens without an organization')
    expect(after(true).join('\n')).not.toContain('update ')
  })

  it('refuses without a default organization, and turning organizations on without the role of the users there already', () => {
    expect(() => step(tokensOnly, undefined)).toThrow('organizations.default is not set')
    expect(() => step(tokensOnly, { ...organizations, existingUsersRole: undefined })).toThrow('organizations.existingUsersRole is not set')
    expect(step(() => false, { ...organizations, existingUsersRole: undefined }).statements).toHaveLength(2)
    expect(step(organizationsOn, { ...organizations, existingUsersRole: undefined }).statements).toHaveLength(2)
  })
})
