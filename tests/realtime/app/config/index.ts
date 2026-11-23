import { f, resource } from '@protobase/schema'

export const conversations = resource('conversations').table('conversations').fields({ id: f.integer().readOnly(), title: f.text() }).primaryKey((r) => r.id).live()
export const conversation_members = resource('conversation_members')
  .table('conversation_members')
  .fields({ id: f.integer().readOnly(), conversation_id: f.relation('conversations').filterable(), user_id: f.text().filterable() })
  .primaryKey((r) => r.id)
  .live()
export const messages = resource('messages').table('messages').fields({ id: f.integer().readOnly(), conversation_id: f.relation('conversations').filterable(), body: f.text() }).primaryKey((r) => r.id).live()
