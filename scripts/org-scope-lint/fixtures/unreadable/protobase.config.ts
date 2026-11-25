import { defineConfig } from '@protobase/config'

const tables = { member: { name: 'memberships' } }

export default defineConfig({ auth: { tables } })
