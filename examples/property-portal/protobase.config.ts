import * as config from './config'
import { roles } from './config/roles'
import { auth, authenticate } from './auth/auth'
import * as jobs from './jobs'

export default { config, auth, authenticate, jobs, options: { roles } }
