import * as config from './config'
import { roles } from './config/roles'
import { auth, authenticate } from './auth/auth'

export default { config, auth, authenticate, options: { roles } }
