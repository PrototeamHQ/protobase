import { describe, expect, it } from 'vitest'
import { resolveNames } from '../better-auth/names/resolve-names'
import { organizationMembersOf } from './organization-members'
import { relayModels } from './relay-models'
import { directsModel, workspaceChannelsModel } from './testing/chat-models'

const wide = relayModels({ channels: { channels: { members: { field: 'member_ids', organization: 'when-null' } } } }, [workspaceChannelsModel()])

describe('organizationMembersOf', () => {
  it("reads the store's member table under the names the app gives it", () => {
    const names = resolveNames({ schema: 'auth', tables: { member: { name: 'memberships', columns: { user_id: 'person_id' } } } })
    expect(organizationMembersOf(wide, names)).toEqual({ table: 'auth.memberships', organization: 'organization_id', user: 'person_id' })
  })

  it('refuses an organization-wide channel while organizations are off', () => {
    expect(() => organizationMembersOf(wide, resolveNames({ schema: 'auth', modules: ['auth'] }))).toThrow('realtime.relay.channels.channels.members.organization needs organizations (auth.organizations)')
  })

  it('needs no member table when no channel reaches an organization', () => {
    expect(organizationMembersOf(relayModels({ channels: { directs: { members: { field: 'members' } } } }, [directsModel()]), undefined)).toBeUndefined()
  })
})
