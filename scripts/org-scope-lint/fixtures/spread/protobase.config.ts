import { defineConfig } from '@protobase/config'

const shared = { tables: { member: { name: 'memberships' } } }

export default defineConfig({ auth: { ...shared } })
