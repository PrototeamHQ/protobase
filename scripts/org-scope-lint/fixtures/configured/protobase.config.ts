import { defineConfig } from '@protobase/config'

export default defineConfig({
  auth: { schema: 'people', tables: { prefix: 'app_', member: { name: 'memberships' } } },
})
