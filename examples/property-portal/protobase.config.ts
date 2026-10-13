import sharp from 'sharp'
import * as config from './config'
import { roles } from './config/roles'
import { auth, authenticate } from './auth/auth'
import * as jobs from './jobs'

// sharp makes the listing photos' variants and placeholders.
export default { config, auth, authenticate, jobs, files: { sharp }, options: { roles } }
