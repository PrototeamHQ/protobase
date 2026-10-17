import { defineConfig } from '@protobase/server'
import * as config from './orders'

// Changes older than 90 days are deleted every night.
export default defineConfig({ config, history: { days: 90 } })
