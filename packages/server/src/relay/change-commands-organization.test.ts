import { describe, expect, it } from 'vitest'
import { changeCommands, organizationsNoticed } from './change-commands'
import type { RelayCommand } from './relay-commands'
import { relayModels } from './relay-models'
import { change, workspaceChannelsModel } from './testing/chat-models'

// A workspace's channels: a public one has no `member_ids` and reaches its whole organization, a private one lists its members.
const models = relayModels({ channels: { channels: { members: { field: 'member_ids', organization: 'when-null' } } } }, [workspaceChannelsModel()])
const none = new Set<string>()
const organizations = new Map([['o1', ['ann', 'bob']], ['o2', ['carl']]])
const shape = (commands: RelayCommand[]) => commands.map((command) => (command.kind === 'publish' ? `${command.event} ${command.users?.join(',')}` : `${command.kind} ${command.users.join(',')}`))

describe('changeCommands of a channel whose record reaches its organization when its members field is null', () => {
  it("adds every member of a new public channel's organization, and nobody of another", () => {
    const created = change('channels', 'create', { after: { id: 1, organization_id: 'o1', member_ids: null } })
    expect(shape(changeCommands(models, [created], new Map([['channels/1', ['ann', 'bob']]]), none, organizations))).toEqual(['add ann,bob', 'joined ann,bob', 'change ann,bob'])
  })

  it('reaches nobody through an empty list, which is no null', () => {
    const created = change('channels', 'create', { after: { id: 2, organization_id: 'o1', member_ids: [] } })
    expect(changeCommands(models, [created], new Map(), none, organizations)).toEqual([])
  })

  it('moves the organization out and the listed people in when a public channel turns private, and back', () => {
    const closed = change('channels', 'update', { before: { id: 1, organization_id: 'o1', member_ids: null }, after: { id: 1, organization_id: 'o1', member_ids: ['ann'] } })
    expect(shape(changeCommands(models, [closed], new Map([['channels/1', ['ann']]]), none, organizations))).toEqual(['change ann,bob', 'remove bob'])
    const opened = change('channels', 'update', { before: { id: 1, organization_id: 'o1', member_ids: ['ann'] }, after: { id: 1, organization_id: 'o1', member_ids: null } })
    expect(shape(changeCommands(models, [opened], new Map([['channels/1', ['ann', 'bob']]]), none, organizations))).toEqual(['add bob', 'joined bob', 'change ann,bob'])
  })

  it('takes the organization out of a soft-deleted public channel', () => {
    const deleted = change('channels', 'delete', { before: { id: 1, organization_id: 'o1', member_ids: null }, after: { id: 1, organization_id: 'o1', member_ids: null, deleted_at: '2026-11-26' } })
    expect(shape(changeCommands(models, [deleted], new Map(), none, organizations))).toEqual(['change ann,bob', 'remove ann,bob'])
  })

  it('names the organizations a batch reaches before or after its changes, never through a list or a soft-deleted record', () => {
    const changes = [
      change('channels', 'update', { before: { id: 1, organization_id: 'o1', member_ids: null }, after: { id: 1, organization_id: 'o1', member_ids: ['ann'] } }),
      change('channels', 'create', { after: { id: 2, organization_id: 'o2', member_ids: ['carl'] } }),
      change('channels', 'create', { after: { id: 3, organization_id: 'o3', member_ids: null, deleted_at: '2026-11-26' } }),
    ]
    expect(organizationsNoticed(models, changes)).toEqual(['o1'])
  })

  it('reaches no organization without the option', () => {
    const plain = relayModels({ channels: { channels: { members: { field: 'member_ids' } } } }, [workspaceChannelsModel()])
    const created = change('channels', 'create', { after: { id: 1, organization_id: 'o1', member_ids: null } })
    expect(organizationsNoticed(plain, [created])).toEqual([])
    expect(changeCommands(plain, [created], new Map(), none, organizations)).toEqual([])
  })
})
