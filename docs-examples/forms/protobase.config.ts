import { defineConfig } from '@protobase/config'

// The form's challenges are signed with PROTOBASE_FORMS_SECRET, or the app's secret when it is not set.
export default defineConfig({
  jobs: {
    // jobs/email-contact-request.ts
    'email-contact-request': { description: 'Emails the shop a new contact request.', arguments: { id: 'integer' } },
  },
})
