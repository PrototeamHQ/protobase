import { defineConfig } from '@protobase/config'

// A relay without a url, so protobase dev starts Protobase Realtime itself. The auth store is the test template's, in
// the public schema.
export default defineConfig({
  auth: { schema: 'public', roles: ['admin'] },
  realtime: { relay: { app: 'chat', channels: { conversations: { members: { resource: 'conversation_members', channel: 'conversation_id', user: 'user_id' } } } } },
})
