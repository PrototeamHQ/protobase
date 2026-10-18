import { defineConfig } from '@protobase/server'
import * as contact from './contact'
import { emailContactRequest, newContactRequests } from './notify'
import { roles } from './roles'

// The form's challenges are signed with PROTOBASE_FORMS_SECRET, or BETTER_AUTH_SECRET when it is not set.
export default defineConfig({ config: { ...contact, newContactRequests }, jobs: { emailContactRequest }, options: { roles } })
