import { defineConfig } from '@protobase/server'
import * as config from './tickets'

// Mentions are emailed by the app's workers, to the users of its Better Auth (`auth`, left out here).
export default defineConfig({ config })
