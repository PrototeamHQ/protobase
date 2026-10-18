import { defineConfig } from '@protobase/server'
import * as config from './tickets'

// The model comes from PROTOBASE_ASSISTANT_API_KEY; the summaries are filled by the app's workers.
export default defineConfig({ config })
