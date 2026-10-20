import { describe, expect, it } from 'vitest'
import { findRelationship } from './find-relationship'
import type { ForeignKey } from './foreign-keys'

const key = (name: string, table: string, columns: string[], foreignTable: string, unique = false): ForeignKey => ({ name, table, columns, foreignTable, foreignColumns: ['id'], unique })

const keys = [
  key('todos_user_id_fkey', 'todos', ['user_id'], 'profiles'),
  key('messages_receiver_id_fkey', 'messages', ['receiver_id'], 'profiles'),
  key('messages_sender_id_fkey', 'messages', ['sender_id'], 'profiles'),
  key('settings_profile_id_fkey', 'settings', ['profile_id'], 'profiles', true),
]

const cardinality = (source: string, target: string, hint?: string) => findRelationship(keys, source, target, hint).cardinality

describe('findRelationship', () => {
  it('finds a foreign key in either direction, one-to-one when its columns are unique', () => {
    expect(findRelationship(keys, 'todos', 'profiles')).toMatchObject({ cardinality: 'many-to-one', join: [{ source: 'user_id', target: 'id' }] })
    expect(findRelationship(keys, 'profiles', 'todos')).toMatchObject({ cardinality: 'one-to-many', join: [{ source: 'id', target: 'user_id' }] })
    expect(cardinality('profiles', 'settings')).toBe('one-to-one')
    expect(cardinality('settings', 'profiles')).toBe('one-to-one')
  })

  it('narrows by a hint naming the foreign key or one of its columns', () => {
    expect(findRelationship(keys, 'messages', 'profiles', 'messages_sender_id_fkey').foreignKey.name).toBe('messages_sender_id_fkey')
    expect(findRelationship(keys, 'messages', 'profiles', 'receiver_id').foreignKey.name).toBe('messages_receiver_id_fkey')
    expect(findRelationship(keys, 'profiles', 'messages', 'sender_id').join).toEqual([{ source: 'id', target: 'sender_id' }])
    expect(cardinality('todos', 'profiles', 'id')).toBe('many-to-one')
  })

  it('is PGRST201 with every candidate when several remain', () => {
    expect(() => findRelationship(keys, 'messages', 'profiles')).toThrow(expect.objectContaining({
      status: 300,
      body: {
        code: 'PGRST201',
        details: [
          { cardinality: 'many-to-one', embedding: 'messages with profiles', relationship: 'messages_receiver_id_fkey using messages(receiver_id) and profiles(id)' },
          { cardinality: 'many-to-one', embedding: 'messages with profiles', relationship: 'messages_sender_id_fkey using messages(sender_id) and profiles(id)' },
        ],
        hint: "Try changing 'profiles' to one of the following: 'profiles!messages_receiver_id_fkey', 'profiles!messages_sender_id_fkey'. Find the desired relationship in the 'details' key.",
        message: "Could not embed because more than one relationship was found for 'messages' and 'profiles'",
      },
    }))
  })

  it('is PGRST200 when none is found, naming the hint', () => {
    expect(() => findRelationship(keys, 'todos', 'messages')).toThrow(expect.objectContaining({ status: 400, body: expect.objectContaining({ code: 'PGRST200', details: "Searched for a foreign key relationship between 'todos' and 'messages' in the schema 'public', but no matches were found." }) }))
    expect(() => findRelationship(keys, 'messages', 'profiles', 'nope')).toThrow(expect.objectContaining({ body: expect.objectContaining({ details: "Searched for a foreign key relationship between 'messages' and 'profiles' using the hint 'nope' in the schema 'public', but no matches were found." }) }))
  })
})
