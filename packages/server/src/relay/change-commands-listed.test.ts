import { describe, expect, it } from 'vitest'
import { audienceChannels, changeCommands, openChannels } from './change-commands'
import { relayModels } from './relay-models'
import { change, directsModel } from './testing/chat-models'

// Direct messages whose records list their members, as a conversation page's `members` derives them.
const models = relayModels({ channels: { directs: { members: { field: 'members' } } } }, [directsModel()])
const none = new Set<string>()

describe('changeCommands of a channel whose records list their members', () => {
  it('adds the people a new record lists, tells each alone on people, then notices them', () => {
    const created = change('directs', 'create', { after: { id: 5, members: ['u1', 'u2'] } })
    expect(changeCommands(models, [created], new Map([['directs/5', ['u1', 'u2']]]), none)).toEqual([
      { kind: 'add', channel: 'directs/5', users: ['u1', 'u2'] },
      { kind: 'publish', id: `${created.sequence}:directs/5:joined`, channel: 'people', users: ['u1', 'u2'], event: 'joined', payload: { channel: 'directs/5' } },
      { kind: 'publish', id: `${created.sequence}:directs/5`, channel: 'directs/5', users: ['u1', 'u2'], event: 'change', payload: { kind: 'create', resource: 'directs', key: '5', channel: 'directs/5' } },
    ])
  })

  it('diffs a members array change: adds who joined and removes who left after the notice, which reaches both', () => {
    const updated = change('directs', 'update', { before: { id: 5, members: ['u1', 'u2'] }, after: { id: 5, members: ['u1', 'u3'] } })
    const commands = changeCommands(models, [updated], new Map([['directs/5', ['u1', 'u3']]]), none)
    expect(commands.map((command) => command.kind === 'publish' ? `${command.event} ${command.users?.join(',')}` : `${command.kind} ${command.users.join(',')}`)).toEqual(['add u3', 'joined u3', 'change u1,u3,u2', 'remove u2'])
  })

  it('moves nobody when the members stay the same, in another order or with a repeat', () => {
    const updated = change('directs', 'update', { before: { id: 5, members: ['u1', 'u2'] }, after: { id: 5, members: ['u2', 'u1', 'u1'] } })
    expect(changeCommands(models, [updated], new Map([['directs/5', ['u1', 'u2']]]), none).map((command) => command.kind)).toEqual(['publish'])
  })

  it('takes everyone out of a deleted or soft-deleted record, and puts them back on an undelete', () => {
    const shape = (commands: ReturnType<typeof changeCommands>) => commands.map((command) => (command.kind === 'publish' ? `${command.event} ${command.users?.join(',')}` : `${command.kind} ${command.users.join(',')}`))
    const deleted = change('directs', 'delete', { before: { id: 5, members: ['u1'] } })
    expect(shape(changeCommands(models, [deleted], new Map(), none))).toEqual(['change u1', 'remove u1'])
    const softDeleted = change('directs', 'delete', { before: { id: 5, members: ['u1'] }, after: { id: 5, members: ['u1'], deleted_at: '2026-11-21' } })
    expect(shape(changeCommands(models, [softDeleted], new Map(), none))).toEqual(['change u1', 'remove u1'])
    const back = change('directs', 'undelete', { before: { id: 5, members: ['u1'], deleted_at: '2026-11-21' }, after: { id: 5, members: ['u1'] } })
    expect(shape(changeCommands(models, [back], new Map([['directs/5', ['u1']]]), none))).toEqual(['add u1', 'joined u1', 'change u1'])
  })

  it('reads ids as text, skips nulls, and lists nobody for a value that is no array', () => {
    const created = change('directs', 'create', { after: { id: 6, members: [7, null, 'u1'] } })
    expect(changeCommands(models, [created], new Map(), none)[0]).toEqual({ kind: 'add', channel: 'directs/6', users: ['7', 'u1'] })
    expect(changeCommands(models, [change('directs', 'create', { after: { id: 7, members: 'u1' } })], new Map(), none)).toEqual([])
  })

  it('counts the channel as one with members, never an open one', () => {
    const updated = change('directs', 'update', { before: { id: 5, members: [] }, after: { id: 5, members: [] } })
    expect(audienceChannels(models, [updated])).toEqual(['directs/5'])
    expect(openChannels(models, [updated])).toEqual([])
  })
})
