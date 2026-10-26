import { defineConfig } from '@protobase/config'

// Changes older than 90 days are deleted every night.
export default defineConfig({ history: { days: 90 } })
